import type { Interview } from "./types.ts";

/** Часть записи для рассказов: текст с отметками [мм:сс] и границы по времени. */
export type StoryPart = { n: number; text: string; from?: number; to?: number; chars: number };

const MAX_PART = 11500;
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

/** Режет запись на части не длиннее лимита сервера. Если есть отметки времени, каждая реплика помечена [мм:сс]. */
export function splitParts(interview: Pick<Interview, "segments" | "text">): StoryPart[] {
  const parts: StoryPart[] = [];
  const segs = interview.segments?.filter((s) => s.text.trim()) ?? [];
  if (segs.length) {
    let cur: { text: string; from: number; to: number } | null = null;
    for (const s of segs) {
      const line = `[${mmss(s.start)}] ${s.text.trim()}\n`;
      if (cur && cur.text.length + line.length > MAX_PART) {
        parts.push({ n: parts.length + 1, text: cur.text.trim(), from: cur.from, to: cur.to, chars: cur.text.length });
        cur = null;
      }
      cur = cur ?? { text: "", from: s.start, to: s.end };
      cur.text += line;
      cur.to = s.end;
    }
    if (cur) parts.push({ n: parts.length + 1, text: cur.text.trim(), from: cur.from, to: cur.to, chars: cur.text.length });
    return parts;
  }
  let cur = "";
  for (const para of interview.text.split(/\n+/)) {
    const p = para.trim();
    if (!p) continue;
    if (cur && cur.length + p.length > MAX_PART) { parts.push({ n: parts.length + 1, text: cur.trim(), chars: cur.length }); cur = ""; }
    for (let i = 0; i < p.length; i += MAX_PART) cur += `${p.slice(i, i + MAX_PART)}\n`;
  }
  if (cur.trim()) parts.push({ n: parts.length + 1, text: cur.trim(), chars: cur.length });
  return parts;
}

const stem = (w: string) => w.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");

/** Где в записи говорится про человека: реплики, в которых есть имя (по основе слова). Время даёт сверить на слух. */
export function mentions(interview: Pick<Interview, "segments" | "text">, name: string, limit = 8): { at?: number; text: string }[] {
  const words = name.split(/\s+/).map(stem).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const keys = words.map((w) => (w.length > 5 ? w.slice(0, w.length - 2) : w.slice(0, Math.max(3, w.length - 1))));
  const hit = (t: string) => { const low = stem(t.replace(/\s+/g, " ")); const hay = t.toLowerCase().replace(/ё/g, "е"); return keys.some((k) => hay.includes(k) || low.includes(k)); };
  const out: { at?: number; text: string }[] = [];
  const segs = interview.segments?.filter((s) => s.text.trim()) ?? [];
  if (segs.length) {
    for (const s of segs) if (hit(s.text)) { out.push({ at: s.start, text: s.text.trim().slice(0, 240) }); if (out.length >= limit) break; }
    return out;
  }
  for (const sentence of interview.text.split(/(?<=[.!?…])\s+/)) if (hit(sentence)) { out.push({ text: sentence.trim().slice(0, 240) }); if (out.length >= limit) break; }
  return out;
}
