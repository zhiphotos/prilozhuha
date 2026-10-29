// Измерение текста на странице: сколько строк займёт абзац. Единицы: % ширины страницы (как у шрифтов и штрихов).
import { fontFamily, fontWeight, lookPad, textMetrics } from "@/lib/rod/page-style";
import { flowAround, obstaclesFor } from "@/lib/rod/wrap-around";
import { explodeBold, stripBold } from "@/lib/rod/rich";
import type { PageBlock } from "@/lib/rod/types";
import { splitWords } from "@/lib/rod/words";

type TextBlock = Extract<PageBlock, { type: "text" }>;
export type TextStyle = Pick<TextBlock, "font" | "size" | "px" | "look" | "wordGap"> & { w: number };

let ctx: CanvasRenderingContext2D | null = null;
const canvas = () => (ctx ??= document.createElement("canvas").getContext("2d"));

/** Разбивает текст на строки так, как их разобьёт страница (по словам, с переносами строк пользователя). */
export function wrapLines(text: string, style: TextStyle): string[] {
  const context = canvas();
  if (!context) return text.split("\n");
  const metrics = textMetrics(style.font, style.size, style.px);
  const pad = lookPad(style.look);
  context.font = `${fontWeight(style.font)} ${metrics.size * 10}px ${fontFamily(style.font)}`;
  const widthPx = Math.max(40, (style.w - pad.x * 2) * 10);
  const gapPx = (style.wordGap ?? 0) * metrics.size * 10;
  const measureCtx = context;
  const widthOf = (text: string) => measureCtx.measureText(stripBold(text)).width + (text.split(" ").length - 1) * gapPx;
  const lines: string[] = [];
  for (const paragraph of explodeBold(text).split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    // Пробелы в начале абзаца (красная строка) сохраняем: пользователь ставит их сам.
    const lead = paragraph.match(/^[ \t]+/)?.[0] ?? "";
    for (const word of splitWords(paragraph)) {
      const test = line ? `${line} ${word}` : lead + word;
      if (line && widthOf(test) > widthPx) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** Расчёт строк для текста, который обтекает фото и стикеры (экран; печать считает тем же flowAround). */
export function wrapAroundLines(block: TextBlock, blocks: PageBlock[]) {
  const context = canvas();
  const metrics = textMetrics(block.font, block.size, block.px);
  const pad = lookPad(block.look);
  if (context) context.font = `${fontWeight(block.font)} ${metrics.size * 10}px ${fontFamily(block.font)}`;
  const gap = (block.wordGap ?? 0) * metrics.size;
  const measure = (text: string) => (context ? context.measureText(stripBold(text)).width / 10 : text.length * metrics.size * 0.5) + (text.split(" ").length - 1) * gap;
  return flowAround({ ...block, text: explodeBold(block.text) }, obstaclesFor(blocks, block), measure, metrics.size * metrics.leading, pad);
}

/** Высота строки и внутренние поля в единицах ширины страницы. */
export function lineBox(style: TextStyle): { line: number; padY: number } {
  const metrics = textMetrics(style.font, style.size, style.px);
  return { line: metrics.size * metrics.leading, padY: lookPad(style.look).y };
}
