// Автоперенос длинного текста на следующие страницы, как в Word: меряем строки тем же шрифтом, что на странице.
import { PAGE_H } from "@/lib/rod/ink";
import { fontFamily, fontWeight, lookPad, textMetrics } from "@/lib/rod/page-style";
import { useRod } from "@/lib/rod/store";
import type { PageBlock } from "@/lib/rod/types";

type TextBlock = Extract<PageBlock, { type: "text" }>;

const BOTTOM = 7; // нижнее поле, % ширины
const TOP = 8; // верх страницы-продолжения

/** Разбивает текст на куски по высоте страницы. Первый кусок остаётся на странице блока. */
export function flowChunks(block: TextBlock): string[] {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return [block.text];
  const metrics = textMetrics(block.font, block.size, block.px);
  const pad = lookPad(block.look);
  const sizePx = metrics.size * 10;
  ctx.font = `${fontWeight(block.font)} ${sizePx}px ${fontFamily(block.font)}`;
  const widthPx = Math.max(40, (block.w - pad.x * 2) * 10);
  const lineH = metrics.size * metrics.leading;
  const room = (top: number) => Math.max(1, Math.floor((PAGE_H - BOTTOM - top - pad.y * 2) / lineH));

  const lines: string[] = [];
  for (const paragraph of block.text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(test).width > widthPx) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
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
