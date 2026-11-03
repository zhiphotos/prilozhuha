// Мягкий край (растушёвка) у фото, картин и стикеров: фото плавно «вливается» в страницу без чёткой рамки.
// Край хранится как маленькая настройка у блока; из неё строится SVG-маска с прозрачностью.
// Экран (CSS-маска) и печать (холст) берут ТУ ЖЕ картинку, поэтому не расходятся.
import type { CSSProperties } from "react";
import { PAGE_RATIO } from "@/lib/rod/page-style";

export type SoftShape = "rect" | "oval" | "rough";
export type SoftEdge = { shape: SoftShape; /** Сила 1..100 */ amount: number };

export const SOFT_SHAPES: { id: SoftShape; label: string }[] = [
  { id: "rect", label: "Прямоугольник" },
  { id: "oval", label: "Овал" },
  { id: "rough", label: "Рисованный край" },
];

const f = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Настройка пригодна: форма известна, сила 1..100. Всё остальное считается «без растушёвки». */
export function cleanSoft(value: unknown): SoftEdge | undefined {
  if (!value || typeof value !== "object") return undefined;
  const { shape, amount } = value as { shape?: unknown; amount?: unknown };
  const n = Number(amount);
  if ((shape !== "rect" && shape !== "oval" && shape !== "rough") || !Number.isFinite(n) || n < 1) return undefined;
  return { shape, amount: clamp(Math.round(n), 1, 100) };
}

/** Высота блока в долях ширины ×100 (маска рисуется в реальных пропорциях, иначе размытие вытянется). */
export function boxHeight(block: { w?: number; h?: number }, fallbackRatio = 0.75): number {
  const w = block.w ?? 0;
  if (typeof block.h === "number" && w > 0) return clamp((block.h * PAGE_RATIO * 100) / w, 5, 1000);
  return clamp(fallbackRatio * 100, 5, 1000);
}

// Постоянные «случайные» отклонения неровного края: одни и те же на экране и в печати, не мигают при перерисовке.
const JITTER = [0.9, 0.2, -0.6, 0.5, -0.9, 0.1, 0.7, -0.3, 0.4, -0.8, 0.6, -0.1, 0.95, -0.5, 0.25, -0.7, 0.35, -0.2, 0.8, -0.95, 0.05, 0.55, -0.4, 0.65];

function roughPath(cx: number, cy: number, rx: number, ry: number, wobble: number): string {
  const n = JITTER.length;
  const pts = JITTER.map((j, i) => {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + (j * wobble) / 100;
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as const;
  });
  // Плавная замкнутая кривая через середины отрезков.
  const mid = (p: readonly [number, number], q: readonly [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const start = mid(pts[n - 1], pts[0]);
  let d = `M${f(start[0])} ${f(start[1])}`;
  for (let i = 0; i < n; i += 1) {
    const m = mid(pts[i], pts[(i + 1) % n]);
    d += `Q${f(pts[i][0])} ${f(pts[i][1])} ${f(m[0])} ${f(m[1])}`;
  }
  return `${d}Z`;
}

export function softSvg(soft: SoftEdge, h: number): string {
  const s = cleanSoft(soft);
  const H = Math.max(5, h);
  if (!s) return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${f(H)}" viewBox="0 0 100 ${f(H)}"><rect width="100" height="${f(H)}" fill="#000"/></svg>`;
  const side = Math.min(100, H);
  const blur = (s.amount / 100) * side * (s.shape === "rough" ? 0.08 : 0.12) + 0.2;
  const inset = blur * 3;
  const w = 100 - inset * 2, hh = H - inset * 2;
  let shape: string;
  if (s.shape === "rect") shape = `<rect x="${f(inset)}" y="${f(inset)}" width="${f(Math.max(1, w))}" height="${f(Math.max(1, hh))}" fill="#000"/>`;
  else if (s.shape === "oval") shape = `<ellipse cx="50" cy="${f(H / 2)}" rx="${f(Math.max(1, w / 2))}" ry="${f(Math.max(1, hh / 2))}" fill="#000"/>`;
  else shape = `<path d="${roughPath(50, H / 2, Math.max(1, w / 2), Math.max(1, hh / 2), 4 + s.amount * 0.12)}" fill="#000"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="${f(H)}" viewBox="0 0 100 ${f(H)}" preserveAspectRatio="none"><defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${f(blur)}"/></filter></defs><g filter="url(#b)">${shape}</g></svg>`;
}

export function softDataUrl(soft: SoftEdge, h: number): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(softSvg(soft, h))}`;
}

/** CSS: одна или две маски вместе (ластик и растушёвка). Две складываются пересечением: видно только то, что видно в обеих. */
export function maskStyleFromUrls(urls: string[]): CSSProperties | undefined {
  if (!urls.length) return undefined;
  const list = urls.map((u) => `url("${u}")`).join(", ");
  const many = (v: string) => urls.map(() => v).join(", ");
  return {
    WebkitMaskImage: list,
    maskImage: list,
    WebkitMaskSize: many("100% 100%"),
    maskSize: many("100% 100%"),
    WebkitMaskRepeat: many("no-repeat"),
    maskRepeat: many("no-repeat"),
    ...(urls.length > 1 ? { WebkitMaskComposite: many("source-in"), maskComposite: many("intersect") } : null),
  } as CSSProperties;
}
