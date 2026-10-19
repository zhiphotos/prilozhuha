import { bodyOf, cors, json } from "../lib/config.js";

/**
 * POST /api/layout { text } -> { items: [{ kind: "heading"|"body"|"quote", text }] }
 * ИИ только размечает вставленный текст (что заголовок, что абзац, что цитата). Слова он менять не имеет права:
 * ответ проверяется, и если слова разошлись с оригиналом, возвращается ошибка, а приложение остаётся на разметке по правилам.
 *   AI_API_KEY   ключ OpenAI-совместимого сервиса (например Polza.ai)
 *   AI_BASE_URL  по умолчанию https://api.polza.ai/api/v1
 *   AI_MODEL     по умолчанию google/gemini-3.1-flash-lite
 */
const MAX_CHARS = 24000;

const PROMPT = `Ты помощник по вёрстке семейной книги. Тебе дают сплошной текст. Разбей его на структуру и верни ТОЛЬКО JSON вида {"items":[{"kind":"heading"|"body"|"quote","text":"..."}]}.
Правила:
- heading: заголовок главы или раздела (короткий, без точки в конце). Если заголовков в тексте нет, не выдумывай их.
- body: обычный абзац. Склей строки одного абзаца в одну.
- quote: прямая речь, цитата, письмо, пословица, выделенная автором.
- НЕ меняй, не исправляй и не сокращай слова. Не добавляй своих слов. Сохрани порядок. Только раздели и назови.`;

const words = (text) => String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const text = String(bodyOf(req).text ?? "").trim();
  if (text.length < 40) return json(res, 400, { error: "Текст слишком короткий." });
  if (text.length > MAX_CHARS) return json(res, 413, { error: "Текст слишком длинный. Вставляйте по частям, до 24 000 знаков." });
  const key = process.env.AI_API_KEY;
  if (!key) return json(res, 503, { error: "ИИ ещё не подключён." });
  try {
    const base = (process.env.AI_BASE_URL || "https://api.polza.ai/api/v1").replace(/\/$/, "");
    const answer = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "google/gemini-3.1-flash-lite",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: PROMPT }, { role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await answer.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(String(content).replace(/^```json\s*|```$/g, ""));
    const items = (Array.isArray(parsed.items) ? parsed.items : [])
      .filter((item) => item && ["heading", "body", "quote"].includes(item.kind) && typeof item.text === "string" && item.text.trim())
      .map((item) => ({ kind: item.kind, text: item.text.trim() }));
    // Страховка: слова не должны отличаться от того, что вставил человек.
    const a = words(text).join(" ");
    const b = words(items.map((item) => item.text).join(" ")).join(" ");
    const same = a.length > 0 && Math.abs(a.length - b.length) / a.length < 0.02 && a.slice(0, 200) === b.slice(0, 200);
    if (!items.length || !same) return json(res, 422, { error: "ИИ изменил текст, поэтому я не стала ему доверять. Оставила разметку по правилам." });
    return json(res, 200, { items });
  } catch (error) {
    console.error("[layout]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "ИИ сейчас не отвечает. Разметка по правилам работает." });
  }
}
