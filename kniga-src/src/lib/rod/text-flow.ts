// Автоперенос длинного текста на следующие страницы, как в Word: меряем строки тем же шрифтом, что на странице.
import { PAGE_H } from "@/lib/rod/ink";
import { lineBox, wrapLines } from "@/lib/rod/measure";
import { useRod } from "@/lib/rod/store";
import type { PageBlock } from "@/lib/rod/types";

type TextBlock = Extract<PageBlock, { type: "text" }>;

const BOTTOM = 7; // нижнее поле, единицы ширины
const TOP = 8; // верх страницы-продолжения, % высоты

/** Разбивает текст на куски по высоте страницы. Первый кусок остаётся на странице блока. */
export function flowChunks(block: TextBlock): string[] {
  const style = { font: block.font, size: block.size, px: block.px, look: block.look, w: block.w };
  const { line, padY } = lineBox(style);
  const lines = wrapLines(block.text, style);
  // y блока в процентах высоты страницы; все расчёты в единицах ширины, как и высота строки.
  const room = (topPercent: number) => Math.max(1, Math.floor((PAGE_H - BOTTOM - (topPercent / 100) * PAGE_H - padY * 2) / line));
  const chunks: string[] = [];
  let at = 0;
  let capacity = room(block.y);
  while (at < lines.length) {
    const part = lines.slice(at, at + capacity);
    at += capacity;
    // Страница не должна начинаться с пустой строки.
    while (part.length && part[0] === "" && chunks.length) part.shift();
    chunks.push(part.join("\n").trimEnd());
    capacity = room(TOP);
  }
  return chunks.filter((chunk, i) => chunk || i === 0);
}

/** Оставляет на странице то, что помещается, а остальное уносит на новые страницы следом. Возвращает число новых страниц. */
export function flowToNextPages(pageId: string, blockId: string): number {
  const state = useRod.getState();
  const index = state.pages.findIndex((page) => page.id === pageId);
  const page = state.pages[index];
  const block = page?.blocks.find((item): item is TextBlock => item.id === blockId && item.type === "text");
  if (!page || !block) return 0;
  const chunks = flowChunks(block);
  if (chunks.length < 2) return 0;
  state.updatePage(pageId, (current) => ({ ...current, blocks: current.blocks.map((item) => (item.id === blockId ? { ...block, text: chunks[0] } : item)) }));
  chunks.slice(1).forEach((text, i) => {
    state.insertPage(
      {
        title: page.title ? `${page.title} (продолжение)` : "Продолжение",
        kind: "page",
        paper: page.paper,
        bg: page.bg,
        chapterId: page.chapterId,
        strokes: [],
        blocks: [{ ...block, id: crypto.randomUUID().slice(0, 8), y: TOP, text }],
      },
      index + 1 + i,
    );
  });
  return chunks.length - 1;
}
