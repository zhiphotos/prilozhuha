import { bodyOf, cors, json } from "../config.js";
import { DEVICE_ERROR, claimDevice } from "../devices.js";
import { redis, redisConfigured } from "../redis.js";
import { readToken } from "../token.js";

/**
 * POST /api/seek { token, deviceId, person, place, seek, question, variants, leads } -> { summary, leads, left }
 * ИИ подсказывает, в каких архивах искать предка. Ссылки берёт только из присланного списка `leads`, ничего не выдумывает.
 * Не больше 10 запросов в месяц на один оплаченный доступ (считает сервер, чтобы лимит нельзя было обойти).
 *   AI_API_KEY, AI_BASE_URL, AI_MODEL – те же, что для «Текст → страницы».
 */
const LIMIT = 10;

const SYSTEM = `Ты коротко говоришь, в каких архивах искать этого человека. Верни только JSON:
{"summary":"","leads":[{"title":"","archive":"","href":"","query":"","why":"","grade":"A"}]}
Правила:
- Не выдумывай родственника, дату и ссылку.
- href копируй только из списка архивов ниже.
- Возьми не больше шести архивов, самые уместные первыми.
- summary: два предложения, куда идти первым и что должно совпасть кроме фамилии.
- query: точная строка для поиска.
- Пиши по-русски, тёплым простым языком, без длинного тире.`;

const month = () => new Date().toISOString().slice(0, 7);
const cut = (v, n) => String(v ?? "").slice(0, n);

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const body = bodyOf(req);
  const access = readToken(String(body.token ?? ""));
  if (!access || Date.now() > access.until) return json(res, 401, { error: "Нужен действующий доступ." });
  if (!(await claimDevice(access.order, body.deviceId))) return json(res, 403, { error: DEVICE_ERROR });
  const key = process.env.AI_API_KEY;
  if (!key) return json(res, 503, { error: "ИИ пока не подключён." });
  const leads = Array.isArray(body.leads) ? body.leads.slice(0, 12) : [];
  if (!leads.length) return json(res, 400, { error: "Нет списка архивов." });

  const counter = `kr:seek:${access.order}:${month()}`;
  let used = 0;
  if (redisConfigured()) {
    used = Number((await redis("GET", counter)) ?? 0);
    if (used >= LIMIT) return json(res, 429, { error: `В этом месяце все ${LIMIT} поисков уже использованы.`, left: 0 });
  }

  const allowed = new Map(leads.map((l) => [String(l.href), l]));
  const list = leads.map((l) => `${cut(l.title, 120)} | ${cut(l.href, 300)} | ${cut(l.why, 200)}`).join("\n");
  const user = `${cut(body.question, 400)}\nВарианты имени: ${(Array.isArray(body.variants) ? body.variants : []).slice(0, 6).map((v) => cut(v, 80)).join("; ")}\nМесто: ${cut(body.place, 160) || "не указано"}\nАрхивы:\n${list}`;

  try {
    const base = (process.env.AI_BASE_URL || "https://api.polza.ai/api/v1").replace(/\/$/, "");
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: process.env.AI_MODEL || "google/gemini-3.1-flash-lite",
        temperature: 0,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
      }),
    });
    if (!response.ok) return json(res, 502, { error: "ИИ не ответил, попробуйте позже." });
    const data = await response.json();
    const raw = String(data?.choices?.[0]?.message?.content ?? "").replace(/^```json\s*|```$/g, "").trim();
    const parsed = JSON.parse(raw);
    const out = (Array.isArray(parsed.leads) ? parsed.leads : []).slice(0, 6).flatMap((lead, i) => {
      const src = allowed.get(String(lead.href ?? ""));
      if (!src) return [];
      return [{
        id: `ai-${i}`,
        title: cut(lead.title || src.title, 140),
        archive: cut(lead.archive || src.archive || src.title, 140),
        href: String(src.href),
        query: cut(lead.query || src.query, 180),
        why: cut(lead.why || src.why, 400),
        grade: ["A", "B", "C"].includes(lead.grade) ? lead.grade : "B",
        seen: false,
      }];
    });
    if (!out.length) return json(res, 502, { error: "ИИ не смог подобрать архивы, попробуйте иначе." });
    if (redisConfigured()) {
      await redis("INCR", counter);
      await redis("EXPIRE", counter, String(40 * 86400));
    }
    return json(res, 200, { summary: cut(parsed.summary, 700), leads: out, left: Math.max(0, LIMIT - used - 1) });
  } catch (error) {
    console.error("[seek]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "ИИ не ответил, попробуйте позже." });
  }
}
