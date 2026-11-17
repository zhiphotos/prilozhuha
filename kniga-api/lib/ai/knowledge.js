// База знаний генеалога: файлы knowledge/*.md (первая строка «# Название», разделы «## ...»).
// Поиск простой, без внешних сервисов: по основам слов вопроса. Возвращает куски и подпись источника.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "knowledge");
let cache = null;

const stem = (w) => w.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 5);
const words = (s) => String(s).split(/\s+/).map(stem).filter((w) => w.length >= 4);

function load() {
  if (cache) return cache;
  const chunks = [];
  let files = [];
  try { files = readdirSync(DIR).filter((f) => f.endsWith(".md")).sort(); } catch { files = []; }
  for (const f of files) {
    const text = readFileSync(join(DIR, f), "utf8");
    const title = (text.match(/^#\s+(.+)$/m) ?? [, f])[1].trim();
    for (const part of text.split(/^##\s+/m).slice(1)) {
      const [head, ...rest] = part.split("\n");
      const body = rest.join("\n").trim();
      if (body) chunks.push({ source: title, section: head.trim(), text: body.slice(0, 1800), stems: new Set(words(`${title} ${head} ${body}`)), headStems: new Set(words(`${title} ${head}`)) });
    }
  }
  cache = chunks;
  return chunks;
}

/** Лучшие куски по вопросу: { context, sources }. Пустой контекст, если ничего подходящего нет. */
export function searchKnowledge(question, limit = 4) {
  const q = [...new Set(words(question))];
  if (!q.length) return { context: "", sources: [] };
  const scored = load()
    .map((c) => ({ c, score: q.reduce((s, w) => s + (c.headStems.has(w) ? 3 : c.stems.has(w) ? 1 : 0), 0) }))
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  const sources = [...new Set(scored.map((x) => x.c.source))];
  const context = scored.map((x, i) => `[${i + 1}] ${x.c.source}, раздел «${x.c.section}»:\n${x.c.text}`).join("\n\n");
  return { context, sources };
}
