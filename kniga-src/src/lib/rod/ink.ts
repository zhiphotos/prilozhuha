// Штрихи: сглаживание, кисти, ластик, распознавание фигур. Всё в единицах «% ширины страницы»,
// поэтому экран (SVG) и печать (Path2D на холсте) рисуют один и тот же путь.
import { getStroke } from "perfect-freehand";
import { COLORS, PAGE_RATIO, PX_PAGE } from "@/lib/rod/page-style";
import { STAMP_DEFAULT_PX, STAMP_KINDS, STAMP_LABELS } from "@/lib/rod/stamp-kinds";
import type { BrushKind, InkStroke, PageBlock } from "@/lib/rod/types";

/** Высота страницы в единицах ширины. */
export const PAGE_H = 100 * PAGE_RATIO;

export function inkColor(color: string): string {
  if (color.startsWith("#") || color.startsWith("rgb")) return color;
  if (color === "rose") return COLORS.rose;
  if (color === "sage") return COLORS.sage;
  if (color === "gold") return "#d9a441";
  if (color === "white") return "#ffffff";
  return COLORS.ink;
}

export const BRUSHES: { id: BrushKind; label: string; hint: string }[] = [
  { id: "pen", label: "Перо", hint: "Тонкая линия, нажим меняет толщину" },
  { id: "marker", label: "Маркер", hint: "Ровный, как маркером по бумаге" },
  { id: "brush", label: "Кисть", hint: "Мягкая, с нажимом" },
  { id: "highlighter", label: "Выделитель", hint: "Широкий и прозрачный" },
  { id: "thread", label: "Нитки", hint: "Шов строчкой" },
  { id: "dashed", label: "Пунктир", hint: "Линия пунктиром" },
  { id: "dots", label: "Точки", hint: "Линия из точек" },
  ...(STAMP_KINDS.map((id) => ({ id, ...STAMP_LABELS[id] })) as { id: BrushKind; label: string; hint: string }[]),
];

/** Размеры кисти в пикселях (страница = 1000 px). */
export const px2w = (px: number) => (px / PX_PAGE) * 100;
export const w2px = (w: number) => Math.round((w / 100) * PX_PAGE * 10) / 10;

export const BRUSH_DEFAULT_PX: Record<BrushKind, number> = { pen: 5, marker: 22, brush: 14, highlighter: 34, thread: 9, dashed: 6, dots: 9, ...STAMP_DEFAULT_PX };
export const BRUSH_ALPHA: Partial<Record<BrushKind, number>> = { marker: 0.45, highlighter: 0.35 };

type Pt = [number, number];

/** Пары чисел → точки (вертикаль приводим к единицам ширины). */
export function toPts(flat: number[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], (flat[i + 1] * PAGE_H) / 100]);
  return out;
}

export function fromPts(points: Pt[]): number[] {
  const out: number[] = [];
  for (const [x, y] of points) out.push(round(x), round((y * 100) / PAGE_H));
  return out;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Удаляет дрожь руки: скользящее среднее, а концы остаются на месте. */
export function stabilize(points: Pt[], radius = 2): Pt[] {
  if (points.length < 4) return points;
  const out: Pt[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const r = Math.min(radius, i, points.length - 1 - i);
    let x = 0;
    let y = 0;
    for (let k = -r; k <= r; k += 1) {
      x += points[i + k][0];
      y += points[i + k][1];
    }
    out.push([x / (2 * r + 1), y / (2 * r + 1)]);
  }
  return out;
}

/** Убирает точки ближе шага друг к другу, чтобы линия не «шуршала» мелкими зигзагами. */
export function thin(points: Pt[], step: number): Pt[] {
  if (points.length < 3) return points;
  const out: Pt[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i][0] - last[0], points[i][1] - last[1]) >= step) out.push(points[i]);
  }
  out.push(points[points.length - 1]);
  return out;
}

/** Чайкин: углы скругляются, один проход. */
export function chaikin(points: Pt[], passes = 1): Pt[] {
  let pts = points;
  for (let p = 0; p < passes; p += 1) {
    if (pts.length < 3) return pts;
    const out: Pt[] = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      out.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1], [0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function pathOf(points: number[][]): string {
  if (!points.length) return "";
  const [first, ...rest] = points;
  let d = `M${r2(first[0])} ${r2(first[1])}`;
  for (const [x, y] of rest) d += `L${r2(x)} ${r2(y)}`;
  return d;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Контур из perfect-freehand → гладкий закрытый путь. */
function outlinePath(outline: number[][]): string {
  if (outline.length < 2) return "";
  let d = `M${r2(outline[0][0])} ${r2(outline[0][1])}`;
  for (let i = 1; i < outline.length; i += 1) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    d += `Q${r2(x0)} ${r2(y0)} ${r2((x0 + x1) / 2)} ${r2((y0 + y1) / 2)}`;
  }
  return `${d}Z`;
}

export type StrokeLayer = { width: number; color: string; alpha: number; dash?: string; cap: "round" | "butt" };

export type StrokeGeom = {
  /** Дополнительные слои поверх основного (у ниток: витки, блик). */
  layers?: StrokeLayer[];
  d: string;
  /** true – заливка контура, false – линия по центру. */
  fill: boolean;
  width: number;
  dash?: string;
  cap: "round" | "butt";
  alpha: number;
  color: string;
};

/** Как рисовать штрих. Одна функция для экрана и печати. */
/** Светлее (amt > 0) или темнее (amt < 0) цвета "#rrggbb". */
export function shade(hex: string, amt: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)))));
  return `#${ch.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Готовая разметка SVG для штриха (живой штрих при рисовании). */
export function geomToSvg(g: StrokeGeom): string {
  if (!g.d) return "";
  if (g.fill) return `<path d="${g.d}" fill="${g.color}" fill-opacity="${g.alpha}"/>`;
  const one = (width: number, color: string, alpha: number, cap: string, dash?: string) =>
    `<path d="${g.d}" fill="none" stroke="${color}" stroke-opacity="${alpha}" stroke-width="${width}" stroke-linecap="${cap}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  return one(g.width, g.color, g.alpha, g.cap, g.dash) + (g.layers ?? []).map((l) => one(l.width, l.color, l.alpha * g.alpha, l.cap, l.dash)).join("");
}

export function strokeGeom(stroke: InkStroke): StrokeGeom {
  const brush: BrushKind = stroke.brush ?? (stroke.alpha && stroke.alpha < 0.9 ? "marker" : "pen");
  const w = stroke.width;
  const color = inkColor(stroke.color);
  const alpha = stroke.alpha ?? BRUSH_ALPHA[brush] ?? 1;
  let pts = toPts(stroke.points);
  if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.01, pts[0][1]]];
  const pressure = stroke.pressure && stroke.pressure.length === pts.length ? stroke.pressure : undefined;

  if (brush === "thread") {
    // Настоящая нитка: толстый жгут с тенью, косые витки и блик по центру.
    const line = pts.length > 3 ? chaikin(thin(stabilize(pts, 2), w * 0.3), 2) : pts;
    const turn = r2(w * 0.55);
    return {
      d: pathOf(line),
      fill: false,
      width: w * 1.18,
      cap: "round",
      alpha,
      color: shade(color, -0.42),
      layers: [
        { width: w, color, alpha: 1, cap: "round" },
        { width: w * 0.92, color: shade(color, -0.3), alpha: 0.85, dash: `${r2(w * 0.16)} ${turn}`, cap: "butt" },
        { width: w * 0.74, color: shade(color, 0.32), alpha: 0.75, dash: `${r2(w * 0.2)} ${r2(w * 0.5)}`, cap: "butt" },
        { width: w * 0.16, color: "#ffffff", alpha: 0.4, cap: "round" },
      ],
    };
  }
  if (brush === "dashed" || brush === "dots") {
    const line = pts.length > 3 ? chaikin(thin(stabilize(pts, 2), w * 0.4), 2) : pts;
    // Нитки – стежки с просветами, у каждого стежка круглые концы; пунктир – длиннее; точки – как бусины.
    const dash = brush === "dashed" ? `${r2(w * 3.2)} ${r2(w * 2.2)}` : `0 ${r2(w * 2.2)}`;
    return { d: pathOf(line), fill: false, width: brush === "dots" ? w * 1.3 : w, dash, cap: "round", alpha, color };
  }

  const smooth = brush === "marker" || brush === "highlighter" ? 0.92 : brush === "brush" ? 0.75 : 0.6;
  const input = brush === "marker" || brush === "highlighter" ? chaikin(thin(stabilize(pts, 3), w * 0.25), 2) : stabilize(pts, 1);
  const withP = input.map((p, i) => {
    const src = pressure ? pressure[Math.min(pressure.length - 1, Math.round((i / Math.max(1, input.length - 1)) * (pressure.length - 1)))] : undefined;
    return src === undefined ? [p[0], p[1]] : [p[0], p[1], src];
  });
  const outline = getStroke(withP, {
    size: w,
    thinning: brush === "marker" || brush === "highlighter" ? 0 : brush === "brush" ? 0.7 : 0.45,
    smoothing: smooth,
    streamline: brush === "marker" || brush === "highlighter" ? 0.85 : 0.55,
    simulatePressure: !pressure && (brush === "pen" || brush === "brush"),
    start: { taper: brush === "brush" ? w * 4 : 0, cap: true },
    end: { taper: brush === "brush" ? w * 6 : 0, cap: true },
    last: true,
  });
  return { d: outlinePath(outline), fill: true, width: 0, cap: "round", alpha, color };
}

// ——— Границы ———

export function strokesBox(strokes: InkStroke[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const stroke of strokes) {
    const half = stroke.width / 2 + 0.2;
    for (let i = 0; i + 1 < stroke.points.length; i += 2) {
      x0 = Math.min(x0, stroke.points[i] - half);
      x1 = Math.max(x1, stroke.points[i] + half);
      y0 = Math.min(y0, stroke.points[i + 1] - half);
      y1 = Math.max(y1, stroke.points[i + 1] + half);
    }
  }
  if (!Number.isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0, y0, x1: Math.max(x1, x0 + 0.5), y1: Math.max(y1, y0 + 0.5) };
}

/** Сдвигает точки штрихов (в ink-блок: от нуля его рамки). */
export function shiftStrokes(strokes: InkStroke[], dx: number, dy: number): InkStroke[] {
  return strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((v, i) => round(v + (i % 2 === 0 ? dx : dy))) }));
}

// ——— Ластик по линиям ———

function densify(points: number[], gap: number, pressure?: number[]): { pts: number[]; pr?: number[] } {
  const out: number[] = [];
  const pr: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const k = i / 2;
    if (i === 0) {
      out.push(points[0], points[1]);
      if (pressure) pr.push(pressure[0] ?? 0.5);
      continue;
    }
    const x0 = points[i - 2];
    const y0 = points[i - 1];
    const x1 = points[i];
    const y1 = points[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.ceil(len / gap));
    for (let s = 1; s <= n; s += 1) {
      const t = s / n;
      out.push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
      if (pressure) pr.push((pressure[k - 1] ?? 0.5) + ((pressure[k] ?? 0.5) - (pressure[k - 1] ?? 0.5)) * t);
    }
  }
  return { pts: out, pr: pressure ? pr : undefined };
}

/** Стирает круг радиусом r (в координатах штрихов). Возвращает новые штрихи или null, если ничего не задето. */
export function eraseFromStrokes(strokes: InkStroke[], cx: number, cy: number, r: number, newId: () => string): InkStroke[] | null {
  let touched = false;
  const out: InkStroke[] = [];
  for (const stroke of strokes) {
    const reach = r + stroke.width / 2;
    let near = false;
    const pts0 = stroke.points;
    if (pts0.length === 2) near = Math.hypot(pts0[0] - cx, pts0[1] - cy) <= reach + 0.5;
    for (let i = 0; i + 3 < pts0.length && !near; i += 2) {
      // Расстояние до отрезка, а не только до его концов: длинную прямую можно стереть посередине.
      const x0 = pts0[i];
      const y0 = pts0[i + 1];
      const dx = pts0[i + 2] - x0;
      const dy = pts0[i + 3] - y0;
      const len2 = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / len2));
      if (Math.hypot(x0 + dx * t - cx, y0 + dy * t - cy) <= reach + 0.5) near = true;
    }
    if (!near) {
      out.push(stroke);
      continue;
    }
    const gap = Math.max(0.12, Math.min(r / 2, 0.8));
    const { pts, pr } = densify(stroke.points, gap, stroke.pressure);
    let anyInside = false;
    for (let i = 0; i + 1 < pts.length; i += 2) {
      if (Math.hypot(pts[i] - cx, pts[i + 1] - cy) <= r) {
        anyInside = true;
        break;
      }
    }
    if (!anyInside) {
      out.push(stroke);
      continue;
    }
    let run: number[] = [];
    let runP: number[] = [];
    let first = true;
    let hit = false;
    const flush = () => {
      if (run.length >= 4) {
        out.push({ ...stroke, id: first ? stroke.id : newId(), points: run, pressure: stroke.pressure ? runP : undefined });
        first = false;
      }
      run = [];
      runP = [];
    };
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const inside = Math.hypot(pts[i] - cx, pts[i + 1] - cy) <= r;
      if (inside) {
        hit = true;
        flush();
      } else {
        run.push(round(pts[i]), round(pts[i + 1]));
        if (pr) runP.push(pr[i / 2]);
      }
    }
    flush();
    if (hit) touched = true;
    else out.push(stroke);
  }
  return touched ? out : null;
}

// ——— Фигуры из «зажатой» линии ———

export type Recognized = { kind: "line" | "circle" | "ellipse" | "rect" | "triangle" | "polygon" | "star" | "heart"; points: number[] } | null;

function pathLength(pts: Pt[]) {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return len;
}

function resample(pts: Pt[], n: number): Pt[] {
  const total = pathLength(pts);
  if (total === 0) return pts;
  const step = total / (n - 1);
  const out: Pt[] = [pts[0]];
  let acc = 0;
  let prev = pts[0];
  for (let i = 1; i < pts.length; i += 1) {
    let cur = pts[i];
    let d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
    while (acc + d >= step && d > 0) {
      const t = (step - acc) / d;
      const q: Pt = [prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t];
      out.push(q);
      prev = q;
      cur = pts[i];
      d = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
      acc = 0;
    }
    acc += d;
    prev = cur;
  }
  while (out.length < n) out.push(pts[pts.length - 1]);
  return out.slice(0, n);
}

function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let maxD = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

function angleAt(a: Pt, b: Pt, c: Pt) {
  const v1: Pt = [a[0] - b[0], a[1] - b[1]];
  const v2: Pt = [c[0] - b[0], c[1] - b[1]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  const m = Math.hypot(...v1) * Math.hypot(...v2) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, dot / m))) * 180) / Math.PI;
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, rot: number, n = 72): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    const x = Math.cos(t) * rx;
    const y = Math.sin(t) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

function starPoints(cx: number, cy: number, r: number, rot: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = rot - Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.42;
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  out.push(out[0]);
  return out;
}

function heartPoints(x0: number, y0: number, w: number, h: number): Pt[] {
  const out: Pt[] = [];
  const n = 90;
  for (let i = 0; i <= n; i += 1) {
    const t = (i / n) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out.push([x0 + ((hx + 16) / 32) * w, y0 + ((hy + 17) / 29.5) * h]);
  }
  return out;
}

/** Угол и размеры по главным осям облака точек. */
function principal(pts: Pt[]) {
  const [mx, my] = centroid(pts);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [x, y] of pts) {
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
    sxy += (x - mx) * (y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { mx, my, angle };
}

/**
 * Узнаёт, что нарисовано: прямая, круг/овал, треугольник, четырёхугольник, звезда, сердце.
 * Если не похоже ни на что – null (штрих остаётся как нарисован, только сглаженный).
 */
export function recognizeShape(flat: number[]): Recognized {
  const raw = toPts(flat);
  if (raw.length < 6) return null;
  const total = pathLength(raw);
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const diag = Math.hypot(maxX - minX, maxY - minY);
  if (diag < 1.5 || total < 2) return null;
  const first = raw[0];
  const last = raw[raw.length - 1];
  const gap = Math.hypot(first[0] - last[0], first[1] - last[1]);
  const closed = gap < Math.max(diag * 0.28, total * 0.12) && total > diag * 1.6;

  if (!closed) {
    // Прямая: отклонение от хорды малое.
    let dev = 0;
    for (const p of raw) {
      const d = Math.abs((last[1] - first[1]) * p[0] - (last[0] - first[0]) * p[1] + last[0] * first[1] - last[1] * first[0]) / (gap || 1);
      dev = Math.max(dev, d);
    }
    if (gap > 0 && dev < Math.max(gap * 0.1, 0.35)) {
      return { kind: "line", points: lineOf(first[0], first[1], last[0], last[1]) };
    }
    return null;
  }

  const pts = resample(raw, 96);
  const [cx, cy] = centroid(pts);
  const radii = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy));
  const mean = radii.reduce((a, b) => a + b, 0) / radii.length;
  const sd = Math.sqrt(radii.reduce((a, b) => a + (b - mean) ** 2, 0) / radii.length);

  // Углы: упрощаем замкнутый контур.
  const closedPts = [...pts, pts[0]];
  // Замкнутый контур режем на две дуги по самой дальней от начала точке: у «петли» начало и конец совпадают, и RDP на ней схлопывается.
  let fi = 1;
  let far = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]);
    if (d > far) {
      far = d;
      fi = i;
    }
  }
  const poly = [...rdp(closedPts.slice(0, fi + 1), diag * 0.055).slice(0, -1), ...rdp(closedPts.slice(fi), diag * 0.055)];
  const corners = poly.length - 1;

  if (corners === 3) {
    const tri = poly.slice(0, 3);
    return { kind: "triangle", points: fromPts([...tri, tri[0]]) };
  }
  if (corners === 4) {
    const [a, b, c, d] = poly;
    const angles = [angleAt(d, a, b), angleAt(a, b, c), angleAt(b, c, d), angleAt(c, d, a)];
    const rightish = angles.every((x) => Math.abs(x - 90) < 22);
    if (rightish) {
      const { mx, my, angle } = principal(pts);
      const snap = Math.abs(((angle * 180) / Math.PI) % 90) < 9 || Math.abs(((angle * 180) / Math.PI) % 90) > 81;
      if (snap) return { kind: "rect", points: fromPts([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]) };
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const proj = pts.map((p) => [(p[0] - mx) * cos + (p[1] - my) * sin, -(p[0] - mx) * sin + (p[1] - my) * cos]);
      const u0 = Math.min(...proj.map((p) => p[0]));
      const u1 = Math.max(...proj.map((p) => p[0]));
      const v0 = Math.min(...proj.map((p) => p[1]));
      const v1 = Math.max(...proj.map((p) => p[1]));
      const back = (u: number, v: number): Pt => [mx + u * cos - v * sin, my + u * sin + v * cos];
      return { kind: "rect", points: fromPts([back(u0, v0), back(u1, v0), back(u1, v1), back(u0, v1), back(u0, v0)]) };
    }
    return { kind: "polygon", points: fromPts([a, b, c, d, a]) };
  }

  // Сердце: два бугра сверху с впадиной посередине и острый низ.
  if (looksLikeHeart(pts, minX, maxX, minY, maxY)) {
    return { kind: "heart", points: fromPts(heartPoints(minX, minY, maxX - minX, maxY - minY)) };
  }
  // Звезда: пять выступов по радиусу.
  if (looksLikeStar(pts, cx, cy, mean)) {
    const rot = starRotation(pts, cx, cy);
    return { kind: "star", points: fromPts(starPoints(cx, cy, Math.max(...radii) * 0.98, rot)) };
  }
  if (sd / mean < 0.12) return { kind: "circle", points: fromPts(ellipsePoints(cx, cy, mean, mean, 0)) };
  const { mx, my, angle } = principal(pts);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const proj = pts.map((p) => [(p[0] - mx) * cos + (p[1] - my) * sin, -(p[0] - mx) * sin + (p[1] - my) * cos]);
  const rx = Math.max(...proj.map((p) => Math.abs(p[0])));
  const ry = Math.max(...proj.map((p) => Math.abs(p[1])));
  const resid = proj.reduce((a, p) => a + Math.abs(Math.hypot(p[0] / rx, p[1] / ry) - 1), 0) / proj.length;
  if (resid < 0.14 && rx > 0 && ry > 0) {
    const snapAxis = Math.abs(((angle * 180) / Math.PI) % 90) < 12 || Math.abs(((angle * 180) / Math.PI) % 90) > 78;
    const [ax, ay] = snapAxis ? [(maxX - minX) / 2, (maxY - minY) / 2] : [rx, ry];
    return { kind: "ellipse", points: fromPts(ellipsePoints(snapAxis ? (minX + maxX) / 2 : mx, snapAxis ? (minY + maxY) / 2 : my, ax, ay, snapAxis ? 0 : angle)) };
  }
  return null;
}

function radialPeaks(pts: Pt[], cx: number, cy: number, mean: number) {
  // Радиус по углу, 72 корзины, сглаженный.
  const bins = 72;
  const prof = new Array<number>(bins).fill(0);
  const cnt = new Array<number>(bins).fill(0);
  for (const [x, y] of pts) {
    const a = Math.atan2(y - cy, x - cx) + Math.PI;
    const b = Math.min(bins - 1, Math.floor((a / (Math.PI * 2)) * bins));
    prof[b] += Math.hypot(x - cx, y - cy);
    cnt[b] += 1;
  }
  for (let i = 0; i < bins; i += 1) prof[i] = cnt[i] ? prof[i] / cnt[i] : mean;
  const smooth = prof.map((_, i) => (prof[(i + bins - 1) % bins] + prof[i] * 2 + prof[(i + 1) % bins]) / 4);
  const peaks: number[] = [];
  for (let i = 0; i < bins; i += 1) {
    const l = smooth[(i + bins - 3) % bins];
    const r = smooth[(i + 3) % bins];
    if (smooth[i] > mean * 1.12 && smooth[i] >= l && smooth[i] >= r && smooth[i] >= smooth[(i + 1) % bins] && smooth[i] > smooth[(i + bins - 1) % bins]) peaks.push(i);
  }
  return { peaks, smooth, bins };
}

function looksLikeStar(pts: Pt[], cx: number, cy: number, mean: number) {
  const { peaks } = radialPeaks(pts, cx, cy, mean);
  return peaks.length === 5;
}

function starRotation(pts: Pt[], cx: number, cy: number) {
  const { peaks, bins } = radialPeaks(pts, cx, cy, pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length);
  if (!peaks.length) return 0;
  // Ближайшая к «вверх» вершина задаёт поворот; звезда ровная, если ушла меньше чем на 12°.
  const up = peaks.map((i) => ((i + 0.5) / bins) * Math.PI * 2 - Math.PI + Math.PI / 2).map((a) => ((a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  const best = up.reduce((m, a) => (Math.abs(a) < Math.abs(m) ? a : m), up[0]);
  return Math.abs(best) < (12 * Math.PI) / 180 ? 0 : best;
}

function looksLikeHeart(pts: Pt[], minX: number, maxX: number, minY: number, maxY: number) {
  const w = maxX - minX;
  const h = maxY - minY;
  if (w < 1 || h < 1 || w / h < 0.7 || w / h > 1.45) return false;
  // Верхний профиль: самая верхняя точка в каждой из 14 колонок.
  const cols = 14;
  const top = new Array<number>(cols).fill(Infinity);
  for (const [x, y] of pts) {
    const c = Math.min(cols - 1, Math.floor(((x - minX) / w) * cols));
    top[c] = Math.min(top[c], y);
  }
  if (top.some((v) => !Number.isFinite(v))) return false;
  const half = cols / 2;
  const leftBest = Math.min(...top.slice(0, half - 1));
  const rightBest = Math.min(...top.slice(half + 1));
  const mid = Math.min(top[half - 1], top[half]);
  const dip = (mid - Math.max(leftBest, rightBest)) / h;
  // Два бугра выше середины, а низ сужается в острие.
  const bottom = pts.filter((p) => p[1] > maxY - h * 0.12);
  const bw = bottom.length ? Math.max(...bottom.map((p) => p[0])) - Math.min(...bottom.map((p) => p[0])) : w;
  return dip > 0.05 && bw < w * 0.5;
}

/** Прямая от начала до конца; почти горизонтальная/вертикальная/диагональная – встаёт ровно. */
export function lineOf(x0: number, y0: number, x1: number, y1: number): number[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4;
  const snapped = Math.round(angle / step) * step;
  const a = Math.abs(angle - snapped) < (5 * Math.PI) / 180 ? snapped : angle;
  return [round(x0), round(y0), round(x0 + Math.cos(a) * len), round(y0 + Math.sin(a) * len)];
}

/** Точки готового штриха после отпускания пера: линия не дрожит, но не меняет форму. */
export function tidy(points: number[]): number[] {
  if (points.length < 8) return points;
  return fromPts(chaikin(thin(stabilize(toPts(points), 1), 0.25), 1));
}

// ——— Рисунок как объект: блок «ink» можно двигать, тянуть, удалять и менять слой ———

export type InkBlock = Extract<PageBlock, { type: "ink" }>;

/** Собирает блок из штрихов, нарисованных в координатах страницы. */
export function makeInkBlock(strokes: InkStroke[], newId: () => string): InkBlock {
  const box = strokesBox(strokes);
  const ow = round(box.x1 - box.x0);
  const oh = round(box.y1 - box.y0);
  return { id: newId(), type: "ink", x: round(box.x0), y: round(box.y0), w: ow, h: oh, ow, oh, strokes: shiftStrokes(strokes, -box.x0, -box.y0) };
}

/** Дописывает штрих к свежему нетронутому рисунку (слово, написанное несколькими штрихами). */
export function mergeInk(block: InkBlock, stroke: InkStroke): InkBlock {
  const untouched = !block.rotate && Math.abs(block.w - block.ow) < 0.05 && Math.abs(block.h - block.oh) < 0.05;
  if (!untouched) return makeInkBlock([stroke], () => crypto.randomUUID());
  const mine = shiftStrokes(block.strokes, block.x, block.y);
  const merged = makeInkBlock([...mine, stroke], () => block.id);
  return { ...merged, locked: block.locked, opacity: block.opacity, blend: block.blend, mask: block.mask };
}

/** Старые страницы хранили чернила поверх всего листа; переносим их в блоки, чтобы с ними можно было работать. */
export function legacyStrokesToBlocks(strokes: InkStroke[]): InkBlock[] {
  return strokes.filter((stroke) => stroke.points.length >= 2).map((stroke) => makeInkBlock([stroke], () => crypto.randomUUID()));
}
