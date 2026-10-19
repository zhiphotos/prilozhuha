// Текст целиком → страницы книги. Заголовки, абзацы и цитаты получают разное оформление, длинное делится по страницам.
import { PAGE_H } from "@/lib/rod/ink";
import { lineBox, wrapLines, type TextStyle } from "@/lib/rod/measure";
import type { BookPage, PageBlock } from "@/lib/rod/types";

export type Item = { kind: "heading" | "body" | "quote"; text: string };

const id = () => crypto.randomUUID();
const BOTTOM = 8; // нижнее поле, единицы ширины
const TOP = 7; // верхнее поле, единицы ширины
const GAP = 2.2; // промежуток между абзацами
const COL = { x: 8, w: 84 };

const QUOTE = /^[«"“„>]|^[—–-]\s/;

/** Размечает вставленный текст: короткие строки без точки, «Глава…», ЗАГЛАВНЫЕ и номера считаются заголовками, строки в кавычках цитатами. */
export function parseStructure(text: string): Item[] {
  const blocks = text.replace(/\r/g, "").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const items: Item[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const single = lines.length === 1 ? lines[0] : "";
    const looksHeading =
      single &&
      single.length <= 70 &&
      !/[.,;:!?…»”]$/.test(single) &&
      (/^(глава|часть|раздел|урок)\s/i.test(single) || /^\d+[.)]\s*\S/.test(single) || single === single.toUpperCase() || single.split(/\s+/).length <= 7);
    if (looksHeading) {
      items.push({ kind: "heading", text: single.replace(/^#+\s*/, "") });
    } else if (lines.every((l) => QUOTE.test(l))) {
      items.push({ kind: "quote", text: lines.join("\n").replace(/^>\s?/gm, "") });
    } else {
      items.push({ kind: "body", text: lines.join(" ").replace(/\s{2,}/g, " ") });
    }
  }
  return items;
}

const STYLE: Record<Item["kind"], TextStyle & { x: number }> = {
  heading: { font: "script", size: "lg", px: 54, look: "plain", w: COL.w, x: COL.x },
  body: { font: "sans", size: "md", px: 30, look: "plain", w: COL.w, x: COL.x },
  quote: { font: "script", size: "md", px: 38, look: "plain", w: 72, x: 14 },
};

type Run = { kind: Item["kind"]; text: string; x: number; y: number; w: number };

/** Раскладывает абзацы по страницам. Заголовок всегда начинает новую страницу. */
export function layoutPages(items: Item[], opts: { paper?: BookPage["paper"] } = {}): Omit<BookPage, "id">[] {
  const pages: Omit<BookPage, "id">[] = [];
  let title = "";
  let runs: Run[] = [];
  let used = TOP;

  const flush = () => {
    if (!runs.length) return;
    const blocks: PageBlock[] = runs.map((run) => ({
      id: id(),
      type: "text",
      x: run.x,
      y: Math.round(((run.y / PAGE_H) * 100) * 100) / 100,
      w: run.w,
      text: run.text,
      font: STYLE[run.kind].font,
      size: STYLE[run.kind].size,
      px: STYLE[run.kind].px,
      look: "plain",
    }));
    pages.push({ title: title || firstWords(runs[0].text), kind: "page", paper: opts.paper ?? "cream", strokes: [], blocks });
    runs = [];
    used = TOP;
  };

  const put = (kind: Item["kind"], text: string) => {
    const style = STYLE[kind];
    const { line } = lineBox(style);
    let lines = wrapLines(text, style);
    while (lines.length) {
      const room = Math.floor((PAGE_H - BOTTOM - used) / line);
      // Заголовок или абзац, который не влезает хотя бы двумя строками, уходит на следующую страницу.
      if (room < Math.min(lines.length, 2) && runs.length) {
        flush();
        continue;
      }
      const take = Math.max(1, Math.min(lines.length, room));
      // Не оставляем одну строку абзаца сиротой на следующей странице.
      const fit = lines.length - take === 1 && take > 2 ? take - 1 : take;
      const part = lines.slice(0, fit).join(kind === "quote" ? "\n" : " ");
      runs.push({ kind, text: part, x: style.x, y: used, w: style.w });
      used += fit * line + GAP;
      lines = lines.slice(fit);
      if (lines.length) flush();
    }
  };

  for (const item of items) {
    if (item.kind === "heading") {
      flush();
      title = item.text;
      put("heading", item.text);
      used += 1.5;
    } else {
      put(item.kind, item.text);
    }
  }
  flush();
  return pages;
}

function firstWords(text: string): string {
  const words = text.split(/\s+/).slice(0, 5).join(" ");
  return words.length > 40 ? `${words.slice(0, 38)}…` : words;
}
