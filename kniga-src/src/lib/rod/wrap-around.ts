// Обтекание текста вокруг фото и стикеров. Всё в единицах ширины страницы (ширина = 100), как у блоков и шрифтов.
// Один расчёт на экран и на печать: считаем, где в каждой строке свободно, и набираем слова только туда.
import { PAGE_H } from "@/lib/rod/ink";
import { peekMedia, resolveMedia } from "@/lib/rod/media";
import { stickerRatio, stickerUrl } from "@/lib/rod/page-style";
import { loadProfile, profileOf, PROFILE_ROWS, type Profile } from "@/lib/rod/shape-profile";
import type { PageBlock } from "@/lib/rod/types";

type TextBlock = Extract<PageBlock, { type: "text" }>;

export type Rect = { left: number; right: number; top: number; bottom: number; /** Контур по прозрачности: полосы сверху вниз. Нет контура – обтекаем по рамке. */ shape?: Profile };
export type WrapLine = { text: string; x: number; y: number; w: number };

const GAP = 2.2; // отступ текста от фото и стикера
const MIN_ROW = 12; // уже этого строка не нужна, пропускаем

/** Какие блоки страницы текст обходит: фото и стикеры (ленты-«скотч» лежат поверх фото и текст не отодвигают). */
export function obstaclesFor(blocks: PageBlock[], self: PageBlock): Rect[] {
  const out: Rect[] = [];
  for (const block of blocks) {
    if (block.id === self.id) continue;
    if (block.type === "photo") {
      const rect: Rect = { left: block.x, right: block.x + block.w, top: (block.y * PAGE_H) / 100, bottom: ((block.y + block.h) * PAGE_H) / 100 };
      // Вырезанное фото-стикер обтекаем по контуру вырезки.
      if (block.frame === "sticker" && block.cut) {
        const url = peekMedia(block.cut);
        if (url) rect.shape = profileOf(url) ?? undefined;
        else void resolveMedia(block.cut).then((u) => loadProfile(u));
        if (url && profileOf(url) === undefined) void loadProfile(url);
      }
      out.push(rect);
    } else if (block.type === "sticker" && block.kind !== "tape" && block.kind !== "tape-sage") {
      const w = block.w ?? 15;
      const top = (block.y * PAGE_H) / 100;
      const url = stickerUrl(block.kind);
      const shape = profileOf(url);
      if (shape === undefined) void loadProfile(url);
      out.push({ left: block.x, right: block.x + w, top, bottom: top + w * stickerRatio(block.kind), shape: shape ?? undefined });
    }
  }
  return out;
}

/** Дожидается контуров стикеров и вырезанных фото (нужно печати: она рисует один раз и ждать потом нечем). */
export async function preloadShapes(blocks: PageBlock[]): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  for (const block of blocks) {
    if (block.type === "sticker") jobs.push(loadProfile(stickerUrl(block.kind)));
    else if (block.type === "photo" && block.frame === "sticker" && block.cut) jobs.push(resolveMedia(block.cut).then((url) => loadProfile(url)));
  }
  await Promise.all(jobs);
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
  // Свободные промежутки строки слева направо: если фото посередине, текст идёт по обе стороны от него.
  const freeSpans = (): { x: number; w: number }[] => {
    const y0 = top + pad.y + row * lineH;
    let spans: [number, number][] = [[pad.x, pad.x + full]];
    for (const o of obstacles) {
      if (o.bottom + GAP <= y0 || o.top - GAP >= y0 + lineH) continue;
      let cutL = o.left - block.x - GAP;
      let cutR = o.right - block.x + GAP;
      if (o.shape) {
        // По форме: берём, как далеко заходит непрозрачное в полосах, которые задевает эта строка.
        const h = o.bottom - o.top;
        const from = Math.max(0, Math.floor(((y0 - GAP - o.top) / h) * PROFILE_ROWS));
        const to = Math.min(PROFILE_ROWS - 1, Math.floor(((y0 + lineH + GAP - o.top) / h) * PROFILE_ROWS));
        let min = 1;
        let max = 0;
        for (let r = from; r <= to; r += 1) {
          const row = o.shape[r];
          if (!row) continue;
          min = Math.min(min, row[0]);
          max = Math.max(max, row[1]);
        }
        if (max <= min) continue;
        const w = o.right - o.left;
        cutL = o.left + min * w - block.x - GAP;
        cutR = o.left + max * w - block.x + GAP;
      }
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
    return spans.sort((p, q) => p[0] - q[0]).map(([a, b]) => ({ x: a, w: b - a }));
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
      const all = freeSpans();
      const usable = all.filter((span) => span.w >= MIN_ROW);
      if (!usable.length) {
        // Весь ряд занят: пропускаем. Если блок сам уже минимума, пишем в него как есть.
        if (full >= MIN_ROW) {
          row += 1;
          continue;
        }
        usable.push({ x: pad.x, w: full });
      }
      for (const span of usable) {
        if (at >= words.length) break;
        let line = words[at];
        at += 1;
        while (at < words.length && measure(`${line} ${words[at]}`) <= span.w) {
          line = `${line} ${words[at]}`;
          at += 1;
        }
        place(line, span);
      }
      row += 1;
    }
  }
  return { lines, height: pad.y * 2 + Math.max(row, 1) * lineH };
}
