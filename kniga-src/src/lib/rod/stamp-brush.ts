// Штамповые кисти из набора «rod-draw-kit»: штрих – цепочка отпечатков вдоль линии.
// Один и тот же растр рисуется на экране (картинка в SVG) и в печати (drawImage), поэтому вид совпадает.
import { BUILTIN_BRUSHES } from "@/lib/draw-kit/brushes.js";
import { planStamps } from "@/lib/draw-kit/geometry.js";
import type { BrushKind, InkStroke } from "@/lib/rod/types";
import { PAGE_H, inkColor, toPts } from "@/lib/rod/ink";

import { STAMP_KINDS, isStampBrush, type StampKind } from "@/lib/rod/stamp-kinds";
export { STAMP_KINDS, isStampBrush };

type KitBrush = {
  id: string; tip: "round" | "calligraphy" | "image"; spacing: number; opacity: number; hardness: number; squeeze?: number;
  sizeJitter: number; opacityJitter: number; scatter: number; angleMode: "fixed" | "direction" | "random"; angle: number;
  pressureSize: boolean; defaultSize: number; procedural?: string;
};
const KIT = new Map<string, KitBrush>((BUILTIN_BRUSHES as unknown as KitBrush[]).map((brush) => [brush.id, { squeeze: 0.25, ...brush }]));

/** Один и тот же штрих всегда выглядит одинаково: случайность берётся из номера штриха. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const tips = new Map<string, HTMLCanvasElement>();
function leafTip(color: string): HTMLCanvasElement {
  const hit = tips.get(color);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.translate(48, 48);
  ctx.rotate(-0.7);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -36);
  ctx.bezierCurveTo(30, -18, 26, 18, 0, 36);
  ctx.bezierCurveTo(-26, 18, -30, -18, 0, -36);
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.bezierCurveTo(2, -8, -2, 8, 0, 26);
  ctx.stroke();
  tips.set(color, canvas);
  return canvas;
}

function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export type StampRaster = { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number };
const cache = new Map<string, StampRaster | null>();

/** Растр штриха в единицах страницы (x, y, w, h – единицы ширины, как у остальных штрихов). */
export function stampRaster(stroke: InkStroke): StampRaster | null {
  const brush = stroke.brush;
  if (!isStampBrush(brush) || typeof document === "undefined") return null;
  const kit = KIT.get(brush);
  if (!kit) return null;
  const key = `${stroke.id}|${brush}|${stroke.color}|${stroke.width}|${stroke.points.length}|${stroke.points[stroke.points.length - 1] ?? 0}|${stroke.alpha ?? ""}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const pts = toPts(stroke.points);
  if (!pts.length) return null;
  const size = stroke.width; // единицы страницы
  const pad = size * 1.6 + 1;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const scale = Math.min(10, 4096 / Math.max(bw, bh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(bw * scale));
  canvas.height = Math.max(1, Math.ceil(bh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const color = inkColor(stroke.color);
  const random = rng(stroke.id + brush);
  const jitter = (amount: number) => (amount ? (random() * 2 - 1) * amount : 0);
  const pressure = stroke.pressure && stroke.pressure.length === pts.length ? stroke.pressure : undefined;
  const dots = pts.map(([x, y], i) => ({ x: x - x0, y: y - y0, pressure: pressure?.[i] ?? 1 }));
  const stamps = planStamps(dots, Math.max(0.05, size * kit.spacing)) as { x: number; y: number; angle: number; pressure?: number }[];
  const base = stroke.alpha ?? 1;
  for (const stamp of stamps) {
    const pressureScale = kit.pressureSize ? 0.35 + 0.65 * Math.max(0, Math.min(1, stamp.pressure ?? 1)) : 1;
    const stampSize = Math.max(0.1, size * (1 + jitter(kit.sizeJitter)) * pressureScale);
    const radius = (stampSize * scale) / 2;
    const alpha = Math.max(0, Math.min(1, kit.opacity * base * (1 + jitter(kit.opacityJitter))));
    const dir = kit.angleMode === "random" ? random() * Math.PI * 2 : stamp.angle;
    const scatter = jitter(kit.scatter) * stampSize * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(stamp.x * scale + Math.cos(dir + Math.PI / 2) * scatter, stamp.y * scale + Math.sin(dir + Math.PI / 2) * scatter);
    ctx.rotate(dir + (kit.angle * Math.PI) / 180);
    if (kit.tip === "calligraphy") {
      ctx.scale(1, kit.squeeze ?? 0.25);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (kit.tip === "image") {
      const side = radius * 2;
      ctx.drawImage(leafTip(color), -side / 2, -side / 2, side, side);
    } else {
      if (kit.hardness >= 0.98) {
        ctx.fillStyle = color;
      } else {
        const g = ctx.createRadialGradient(0, 0, radius * kit.hardness, 0, 0, radius);
        g.addColorStop(0, color);
        g.addColorStop(1, withAlpha(color, 0));
        ctx.fillStyle = g;
      }
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  const result: StampRaster = { canvas, x: x0, y: y0, w: bw, h: bh };
  if (cache.size > 160) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

/** Чтобы PAGE_H не терялся при сборке и было видно, в каких единицах растр. */
export const STAMP_UNITS_HEIGHT = PAGE_H;
