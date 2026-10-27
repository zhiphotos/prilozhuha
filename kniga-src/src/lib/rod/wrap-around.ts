// Обтекание текста вокруг фото и стикеров. Всё в единицах ширины страницы (ширина = 100), как у блоков и шрифтов.
// Один расчёт на экран и на печать: считаем, где в каждой строке свободно, и набираем слова только туда.
import { PAGE_H } from "@/lib/rod/ink";
import { stickerRatio } from "@/lib/rod/page-style";
import type { PageBlock } from "@/lib/rod/types";

type TextBlock = Extract<PageBlock, { type: "text" }>;

export type Rect = { left: number; right: number; top: number; bottom: number };
export type WrapLine = { text: string; x: number; y: number; w: number };

const GAP = 2.2; // отступ текста от фото и стикера
const MIN_ROW = 12; // уже этого строка не нужна, пропускаем

/** Какие блоки страницы текст обходит: фото и стикеры (ленты-«скотч» лежат поверх фото и текст не отодвигают). */
export function obstaclesFor(blocks: PageBlock[], self: PageBlock): Rect[] {
  const out: Rect[] = [];
  for (const block of blocks) {
    if (block.id === self.id) continue;
    if (block.type === "photo") {
      out.push({ left: block.x, right: block.x + block.w, top: (block.y * PAGE_H) / 100, bottom: ((block.y + block.h) * PAGE_H) / 100 });
    } else if (block.type === "sticker" && block.kind !== "tape" && block.kind !== "tape-sage") {
      const w = block.w ?? 15;
      const top = (block.y * PAGE_H) / 100;
      out.push({ left: block.x, right: block.x + w, top, bottom: top + w * stickerRatio(block.kind) });
    }
  }
  return out;
}

/**
 * Набирает текст по строкам вокруг препятствий. measure возвращает ширину строки в тех же единицах.
 * Строка идёт в самый широкий свободный промежуток; если места нет, ряд пропускается.
 */
export function flowAround(
  block: TextBlock,
  obstacles: Rect[],
  measure: (text: string) => number,
  lineH: number,
  pad: { x: number; y: number },
): { lines: WrapLine[]; height: number } {
  const top = (block.y * PAGE_H) / 100;
  const full = block.w - pad.x * 2;
  const align = block.align ?? "left";
  const lines: WrapLine[] = [];
  const paragraphs = block.text.split("\n");
  let row = 0;
  const free = (): { x: number; w: number } => {
    const y0 = top + pad.y + row * lineH;
    let spans: [number, number][] = [[pad.x, pad.x + full]];
    for (const o of obstacles) {
      if (o.bottom + GAP <= y0 || o.top - GAP >= y0 + lineH) continue;
      const cutL = o.left - block.x - GAP;
      const cutR = o.right - block.x + GAP;
      const next: [number, number][] = [];
      for (const [a, b] of spans) {
        if (cutR <= a || cutL >= b) next.push([a, b]);
        else {
          if (cutL > a) next.push([a, cutL]);
          if (cutR < b) next.push([cutR, b]);
        }
      }
      spans = next;
    }
    const best = spans.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0];
    return best ? { x: best[0], w: best[1] - best[0] } : { x: pad.x, w: 0 };
  };
  const place = (text: string, span: { x: number; w: number }) => {
    const width = measure(text);
    const x = align === "center" ? span.x + (span.w - width) / 2 : align === "right" ? span.x + span.w - width : span.x;
    lines.push({ text, x, y: pad.y + row * lineH, w: width });
  };

  let guard = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      row += 1;
      continue;
    }
    let at = 0;
    while (at < words.length && guard++ < 4000) {
      const span = free();
      if (span.w < MIN_ROW && span.w < full) {
        row += 1;
        continue;
      }
      let line = words[at];
      at += 1;
      while (at < words.length && measure(`${line} ${words[at]}`) <= span.w) {
        line = `${line} ${words[at]}`;
        at += 1;
      }
      place(line, span);
      row += 1;
    }
  }
  return { lines, height: pad.y * 2 + Math.max(row, 1) * lineH };
}
