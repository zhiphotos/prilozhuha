// База знаний генеалога: файлы knowledge/*.md (свои тексты) и knowledge-skill/*.md (материалы открытого скилла ex-ussr-kinship-research, лицензия MIT, автор Denis Shiryaev).
// Первая строка «# Название», разделы «## ...». Длинные разделы режутся на куски по абзацам.
// Поиск простой, без внешних сервисов: по основам слов вопроса. Возвращает куски и подпись источника, чтобы генеалог мог назвать, откуда ответ.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPORA = [
  { dir: join(ROOT, "knowledge"), prefix: "" },
  { dir: join(ROOT, "knowledge-skill"), prefix: "Скилл «Исследование родства, бывший СССР»: " },
];
const PIECE = 1500;
let cache = null;

const stem = (w) => w.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 5);
const words = (s) => String(s).split(/\s+/).map(stem).filter((w) => w.length >= 4);

/** Режет длинный текст на куски не длиннее PIECE по абзацам. */
function pieces(body) {
  const out = [];
  let cur = "";
  for (const para of body.split(/\n{2,}/)) {
    if (cur && cur.length + para.length > PIECE) {
      out.push(cur.trim());
      cur = "";
    }
    cur += `${para}\n\n`;
    while (cur.length > PIECE * 1.6) {
      out.push(cur.slice(0, PIECE).trim());
      cur = cur.slice(PIECE);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function load() {
  if (cache) return cache;
  const chunks = [];
  for (const { dir, prefix } of CORPORA) {
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith(".md")).sort(); } catch { files = []; }
    for (const f of files) {
      const text = readFileSync(join(dir, f), "utf8").replace(/^---[\s\S]*?\n---\n/, "");
      const title = prefix + (text.match(/^#\s+(.+)$/m) ?? [, f])[1].trim();
      const parts = text.split(/^##\s+/m);
      const sections = parts.length > 1 ? parts.slice(1) : [`Общее\n${text.replace(/^#\s+.+$/m, "")}`];
      for (const part of sections) {
        const [head, ...rest] = part.split("\n");
        const body = rest.join("\n").trim();
        if (!body) continue;
        for (const piece of pieces(body)) {
          chunks.push({ source: title, section: head.trim(), text: piece, stems: new Set(words(`${title} ${head} ${piece}`)), headStems: new Set(words(`${title} ${head}`)) });
        }
      }
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
