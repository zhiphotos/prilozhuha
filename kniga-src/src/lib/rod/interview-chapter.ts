import { KIND_ORDER, KIND_TITLE } from "./interview-facts.ts";
import type { Interview } from "./types.ts";

/** Фрагмент записи с номером: на него ссылается глава как на [3]. */
export type ChapterSource = { n: number; label: string; quote: string };

const MAX_TOTAL = 13500;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

/**
 * Из карточек фактов интервью собирает нумерованные фрагменты для главы. Берёт всё, кроме отмеченного «неверно»,
 * сначала подтверждённое, потом остальное по разделам. Цитата остаётся дословной, она и есть источник.
 */
export function buildFragments(interview: Pick<Interview, "facts" | "title">): { text: string; sources: ChapterSource[] } {
  const rank = (r: string) => (r === "confirmed" ? 0 : 1);
  const facts = interview.facts
    .filter((f) => f.review !== "wrong")
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.review) - rank(b.f.review) || KIND_ORDER.indexOf(a.f.kind) - KIND_ORDER.indexOf(b.f.kind) || a.i - b.i)
    .map((x) => x.f);
  const lines: string[] = [];
  const sources: ChapterSource[] = [];
  let total = 0;
  for (const f of facts) {
    const meta = [f.relation, f.years, f.place].map((v) => v.trim()).filter(Boolean).join(", ");
    const body = [f.title.trim(), f.detail.trim(), meta].filter(Boolean).join(". ");
    const quote = clip(f.quote.trim(), 260);
    const n = sources.length + 1;
    const line = `[${n}] ${KIND_TITLE[f.kind] ?? f.kind}: ${clip(body, 320)}${quote ? ` «${quote}»` : ""}`;
    if (total + line.length > MAX_TOTAL) break;
    total += line.length + 1;
    lines.push(line);
    sources.push({ n, label: `${KIND_TITLE[f.kind] ?? f.kind}: ${clip(f.title.trim(), 80)}`, quote });
  }
  return { text: lines.join("\n"), sources };
}
