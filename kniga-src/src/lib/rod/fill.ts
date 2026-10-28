// Заливка нажатием внутрь контура (алгоритм из rod-draw-kit). Линии страницы – стены, внутри красим.
// Цвет хранится в самом рисунке (`fill` у блока «ink») и лежит под его линиями: фигуру с заливкой можно двигать,
// сжимать, поворачивать, дублировать и стирать, как фото.
import { floodRegion, paintPixels } from "@/lib/draw-kit/flood.js";
import { PAGE_H, inkColor } from "@/lib/rod/ink";
import { mediaDataUrl, saveMedia } from "@/lib/rod/media";
import { PAGE_RATIO } from "@/lib/rod/page-style";
import { paintStrokeList } from "@/lib/rod/print-book";
import type { BookPage, PageBlock } from "@/lib/rod/types";

const W = 1000;

type InkBlock = Extract<PageBlock, { type: "ink" }>;
export type FillResult = { ok: true; page: (page: BookPage) => BookPage } | { ok: false; reason: "outside" | "wall" | "open" | "error" };

/** Стены: все рисунки страницы на прозрачном холсте. */
export function drawWalls(page: BookPage, w: number, h: number): CanvasRenderingContext2D {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.save();
  ctx.scale(w / 100, w / 100);
  paintStrokeList(ctx, page.strokes);
  ctx.restore();
  for (const block of page.blocks) {
    if (block.type !== "ink") continue;
    ctx.save();
    ctx.setTransform(blockMatrix(block, w, h, block.ow, (block.oh * PAGE_H) / 100));
    paintStrokeList(ctx, block.strokes);
    ctx.restore();
  }
  return ctx;
}

/** Матрица «координаты рисунка (0..lw, 0..lh) → пиксели страницы». */
function blockMatrix(block: InkBlock, w: number, h: number, lw: number, lh: number): DOMMatrix {
  const bx = (block.x / 100) * w;
  const by = (block.y / 100) * h;
  const bw = (block.w / 100) * w;
  const bh = (block.h / 100) * h;
  return new DOMMatrix()
    .translate(bx + bw / 2, by + bh / 2)
    .rotate(block.rotate ?? 0)
    .translate(-(bx + bw / 2), -(by + bh / 2))
    .translate(bx, by)
    .scale(bw / lw, bh / lh);
}

function rgba(color: string): [number, number, number, number] {
  const c = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!c) return [0, 0, 0, 255];
  c.fillStyle = inkColor(color);
  c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], 255];
}

/** xPct, yPct – место нажатия в процентах ширины и высоты страницы. */
export async function fillInside(page: BookPage, xPct: number, yPct: number, color: string): Promise<FillResult> {
  try {
    const h = Math.round(W * PAGE_RATIO);
    const inks = page.blocks.filter((block): block is InkBlock => block.type === "ink");
    if (!inks.length) return { ok: false, reason: "wall" };
    const walls = drawWalls(page, W, h);
    const data = walls.getImageData(0, 0, W, h);
    // Маленькие щели в линии закрываем сами: сначала узко, потом шире. Если и так вытекает, контур открыт.
    let region: ReturnType<typeof floodRegion> = { ok: false, reason: "open" };
    let used = 3;
    for (const gap of [3, 6, 10]) {
      region = floodRegion(data.data, W, h, (xPct / 100) * W, (yPct / 100) * h, { gap, alphaWall: 24, edgeIsWall: false });
      used = gap;
      if (region.ok || region.reason !== "open") break;
    }
    if (!region.ok) return { ok: false, reason: region.reason };

    // Чьей фигуре принадлежит область: блок, чья рамка больше всего пересекается с залитым местом.
    let minX = W, minY = h, maxX = 0, maxY = 0;
    for (const index of region.pixels) {
      const x = index % W;
      const y = (index - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    let owner: InkBlock | null = null;
    let best = 0;
    for (const block of inks) {
      const bx = (block.x / 100) * W;
      const by = (block.y / 100) * h;
      const bw = (block.w / 100) * W;
      const bh = (block.h / 100) * h;
      const overlap = Math.max(0, Math.min(maxX, bx + bw) - Math.max(minX, bx)) * Math.max(0, Math.min(maxY, by + bh) - Math.max(minY, by));
      if (overlap > best) {
        best = overlap;
        owner = block;
      }
    }
    if (!owner) return { ok: false, reason: "error" };

    // Область на холсте страницы (чуть шире, чтобы цвет заходил под линию без белой каймы).
    const layer = document.createElement("canvas");
    layer.width = W;
    layer.height = h;
    const lctx = layer.getContext("2d", { willReadFrequently: true });
    if (!lctx) return { ok: false, reason: "error" };
    // Область сузилась на размер щели: возвращаем её к линии. Шагаем только по пустым пикселям, и ещё на шаг в саму линию
    // (цвет ляжет под линию), так что цвет не выходит за контур.
    const filled = new Uint8Array(W * h);
    let front: number[] = [];
    for (const index of region.pixels) {
      filled[index] = 1;
      front.push(index);
    }
    const isWall = (index: number) => data.data[index * 4 + 3] >= 24;
    for (let step = 0; step < used + 2 && front.length; step++) {
      const next: number[] = [];
      for (const index of front) {
        const x = index % W;
        const y = (index - x) / W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= h) continue;
          const n = ny * W + nx;
          if (filled[n]) continue;
          filled[n] = 1;
          if (!isWall(n)) next.push(n); // линия заливается, но дальше через неё не идём
        }
      }
      front = next;
    }
    const idle: number[] = [];
    for (let i = 0; i < filled.length; i++) if (filled[i]) idle.push(i);
    const pixels = lctx.getImageData(0, 0, W, h);
    paintPixels(pixels.data, idle, rgba(color));
    lctx.putImageData(pixels, 0, 0);

    // Переносим цвет в «карманную» картинку самого рисунка.
    const scale = Math.min(10, 2400 / Math.max(owner.ow, owner.oh));
    const lw = Math.max(2, Math.round(owner.ow * scale));
    const lh = Math.max(2, Math.round(owner.oh * scale));
    const local = document.createElement("canvas");
    local.width = lw;
    local.height = lh;
    const ctx = local.getContext("2d");
    if (!ctx) return { ok: false, reason: "error" };
    if (owner.fill) {
      const old = new Image();
      old.src = await mediaDataUrl(owner.fill);
      await old.decode().catch(() => undefined);
      if (old.naturalWidth) ctx.drawImage(old, 0, 0, lw, lh);
    }
    ctx.save();
    ctx.setTransform(blockMatrix(owner, W, h, lw, lh).inverse());
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    const blob = await new Promise<Blob | null>((resolve) => local.toBlob(resolve, "image/png"));
    if (!blob) return { ok: false, reason: "error" };
    const src = await saveMedia(blob);
    const ownerId = owner.id;
    return {
      ok: true,
      page: (current) => ({ ...current, blocks: current.blocks.map((item) => (item.id === ownerId && item.type === "ink" ? { ...item, fill: src } : item)) }),
    };
  } catch (error) {
    console.error("fill", error);
    return { ok: false, reason: "error" };
  }
}
