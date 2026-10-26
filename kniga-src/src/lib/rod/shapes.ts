// Фигуры, стрелки, точки: векторные, тянутся как угодно. Экран (SVG) и печать (Path2D) берут пути отсюда.
import { COLORS } from "@/lib/rod/page-style";
import type { PageBlock, ShapeKind } from "@/lib/rod/types";

export type ShapeBlock = Extract<PageBlock, { type: "shape" }>;

export const SHAPES: { id: ShapeKind; label: string; stroked: boolean }[] = [
  { id: "rect", label: "Квадрат / прямоугольник", stroked: false },
  { id: "round", label: "Скруглённый", stroked: false },
  { id: "ellipse", label: "Круг / овал", stroked: false },
  { id: "triangle", label: "Треугольник", stroked: false },
  { id: "diamond", label: "Ромб", stroked: false },
  { id: "star", label: "Звезда", stroked: false },
  { id: "heart", label: "Сердце", stroked: false },
  { id: "burst", label: "Вспышка", stroked: false },
  { id: "dot", label: "Точка", stroked: false },
  { id: "ring", label: "Кольцо", stroked: true },
  { id: "cross", label: "Крестик", stroked: true },
  { id: "line", label: "Линия", stroked: true },
  { id: "arrow", label: "Стрелка", stroked: true },
  { id: "arrow2", label: "Стрелка ↔", stroked: true },
  { id: "curve", label: "Изогнутая", stroked: true },
  { id: "dots", label: "Точечки", stroked: true },
  { id: "stitch", label: "Строчка", stroked: true },
];

export const isStrokedShape = (kind: ShapeKind) => SHAPES.find((s) => s.id === kind)?.stroked ?? false;

export function defaultShapeBox(kind: ShapeKind): { w: number; h: number } {
  if (kind === "line" || kind === "dots" || kind === "stitch") return { w: 40, h: 3 };
  if (kind === "arrow" || kind === "arrow2") return { w: 30, h: 8 };
  if (kind === "curve") return { w: 30, h: 16 };
  if (kind === "dot") return { w: 4, h: 4 };
  if (kind === "cross") return { w: 8, h: 8 };
  return { w: 22, h: 22 };
}

export type ShapeStyle = { fill: string | null; stroke: string | null; strokeW: number };

export function shapeStyle(block: ShapeBlock): ShapeStyle {
  if (isStrokedShape(block.shape)) {
    return { fill: null, stroke: block.stroke ?? block.fill ?? COLORS.ink, strokeW: block.strokeW ?? (block.shape === "dots" ? 1.6 : 0.8) };
  }
  return { fill: block.fill ?? COLORS.rose, stroke: block.stroke ?? null, strokeW: block.strokeW ?? 0.6 };
}

export type ShapePart = { d: string; fill: boolean; stroke: boolean; dash?: string; cap?: "round" | "butt" };

const f = (v: number) => Math.round(v * 100) / 100;

function poly(pts: [number, number][], close = true) {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + (close ? "Z" : "");
}

/** Пути фигуры внутри рамки w×h (в % страницы). Линия обводки целиком внутри рамки. */
export function shapeParts(kind: ShapeKind, w: number, h: number, sw: number): ShapePart[] {
  const i = sw / 2;
  const W = Math.max(0.1, w - sw);
  const H = Math.max(0.1, h - sw);
  const cx = w / 2;
  const cy = h / 2;
  switch (kind) {
    case "rect":
      return [{ d: poly([[i, i], [i + W, i], [i + W, i + H], [i, i + H]]), fill: true, stroke: true }];
    case "round": {
      const r = Math.min(W, H) * 0.22;
      return [{ d: `M${f(i + r)} ${f(i)}H${f(i + W - r)}Q${f(i + W)} ${f(i)} ${f(i + W)} ${f(i + r)}V${f(i + H - r)}Q${f(i + W)} ${f(i + H)} ${f(i + W - r)} ${f(i + H)}H${f(i + r)}Q${f(i)} ${f(i + H)} ${f(i)} ${f(i + H - r)}V${f(i + r)}Q${f(i)} ${f(i)} ${f(i + r)} ${f(i)}Z`, fill: true, stroke: true }];
    }
    case "ellipse":
    case "dot":
    case "ring": {
      const rx = W / 2;
      const ry = H / 2;
      return [{ d: `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`, fill: kind !== "ring", stroke: true }];
    }
    case "triangle":
      return [{ d: poly([[cx, i], [i + W, i + H], [i, i + H]]), fill: true, stroke: true }];
    case "diamond":
      return [{ d: poly([[cx, i], [i + W, cy], [cx, i + H], [i, cy]]), fill: true, stroke: true }];
    case "star": {
      const pts: [number, number][] = [];
      for (let k = 0; k < 10; k += 1) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 === 0 ? 1 : 0.42;
        pts.push([cx + Math.cos(a) * r * (W / 2) * 1.05, cy + 0.04 * H + Math.sin(a) * r * (H / 2) * 1.05]);
      }
      return [{ d: poly(pts), fill: true, stroke: true }];
    }
    case "burst": {
      const pts: [number, number][] = [];
      for (let k = 0; k < 24; k += 1) {
        const a = (k * Math.PI) / 12;
        const r = k % 2 === 0 ? 1 : 0.72;
        pts.push([cx + Math.cos(a) * r * (W / 2), cy + Math.sin(a) * r * (H / 2)]);
      }
      return [{ d: poly(pts), fill: true, stroke: true }];
    }
    case "heart": {
      const pts: [number, number][] = [];
      for (let k = 0; k <= 80; k += 1) {
        const t = (k / 80) * Math.PI * 2;
        const hx = 16 * Math.sin(t) ** 3;
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        pts.push([i + ((hx + 16) / 32) * W, i + ((hy + 17) / 29.5) * H]);
      }
      return [{ d: poly(pts), fill: true, stroke: true }];
    }
    case "cross":
      return [{ d: `M${f(i)} ${f(cy)}H${f(w - i)}M${f(cx)} ${f(i)}V${f(h - i)}`, fill: false, stroke: true, cap: "round" }];
    case "line":
      return [{ d: `M${f(i)} ${f(cy)}H${f(w - i)}`, fill: false, stroke: true, cap: "round" }];
    case "dots":
      return [{ d: `M${f(i)} ${f(cy)}H${f(w - i)}`, fill: false, stroke: true, dash: `0 ${f(sw * 1.9)}`, cap: "round" }];
    case "stitch":
      return [{ d: `M${f(i)} ${f(cy)}H${f(w - i)}`, fill: false, stroke: true, dash: `${f(sw * 2.6)} ${f(sw * 1.7)}`, cap: "round" }];
    case "arrow":
    case "arrow2": {
      const head = Math.min(h / 2 - i, w * 0.3);
      const d = [`M${f(i)} ${f(cy)}H${f(w - i)}`, `M${f(w - i - head)} ${f(cy - head)}L${f(w - i)} ${f(cy)}L${f(w - i - head)} ${f(cy + head)}`];
      if (kind === "arrow2") d.push(`M${f(i + head)} ${f(cy - head)}L${f(i)} ${f(cy)}L${f(i + head)} ${f(cy + head)}`);
      return [{ d: d.join(""), fill: false, stroke: true, cap: "round" }];
    }
    case "curve": {
      const sx = i;
      const sy = h - i;
      const ex = w - i;
      const ey = i + h * 0.18;
      const c1x = w * 0.15;
      const c1y = h * 0.05;
      const c2x = w * 0.7;
      const c2y = h * 0.05;
      const ang = Math.atan2(ey - c2y, ex - c2x);
      const head = Math.min(h * 0.4, w * 0.18);
      const hx = (a: number) => ex - Math.cos(ang + a) * head;
      const hy = (a: number) => ey - Math.sin(ang + a) * head;
      return [{ d: `M${f(sx)} ${f(sy)}C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(ex)} ${f(ey)}M${f(hx(0.5))} ${f(hy(0.5))}L${f(ex)} ${f(ey)}L${f(hx(-0.5))} ${f(hy(-0.5))}`, fill: false, stroke: true, cap: "round" }];
    }
    default:
      return [];
  }
}
