// Измерение текста на странице: сколько строк займёт абзац. Единицы: % ширины страницы (как у шрифтов и штрихов).
import { fontFamily, fontWeight, lookPad, textMetrics } from "@/lib/rod/page-style";
import type { PageBlock } from "@/lib/rod/types";

type TextBlock = Extract<PageBlock, { type: "text" }>;
export type TextStyle = Pick<TextBlock, "font" | "size" | "px" | "look"> & { w: number };

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
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (line && context.measureText(test).width > widthPx) {
        lines.push(line);
        line = word;
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

/** Высота строки и внутренние поля в единицах ширины страницы. */
export function lineBox(style: TextStyle): { line: number; padY: number } {
  const metrics = textMetrics(style.font, style.size, style.px);
  return { line: metrics.size * metrics.leading, padY: lookPad(style.look).y };
}
