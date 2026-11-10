// Готовые макеты расположения фото, как в Canva: пустые рамки, в каждую нажатием кладётся своё фото.
import type { PageBlock } from "@/lib/rod/types";

type Node = "p" | { dir: "h" | "v"; items: [number, Node][] };
type Frame = Extract<PageBlock, { type: "slot" }>["frame"];
type Rect = { x: number; y: number; w: number; h: number; rotate?: number; frame?: Frame };

export type PhotoLayout = { id: string; n: number; label: string; rects: Rect[] };

// Область под фото: внутри охранного поля страницы.
const AREA = { x: 6, y: 7, w: 88, h: 86 };
const GAP = 1.6;

const H = (...items: Array<Node | [number, Node]>): Node => ({ dir: "h", items: items.map((i) => (Array.isArray(i) ? i : ([1, i] as [number, Node]))) });
const V = (...items: Array<Node | [number, Node]>): Node => ({ dir: "v", items: items.map((i) => (Array.isArray(i) ? i : ([1, i] as [number, Node]))) });

function fill(node: Node, x: number, y: number, w: number, h: number, out: Rect[]) {
  if (node === "p") {
    out.push({ x, y, w, h });
    return;
  }
  const total = node.items.reduce((s, [k]) => s + k, 0);
  const span = (node.dir === "h" ? w : h) - GAP * (node.items.length - 1);
  let at = node.dir === "h" ? x : y;
  for (const [k, child] of node.items) {
    const size = (span * k) / total;
    if (node.dir === "h") fill(child, at, y, size, h, out);
    else fill(child, x, at, w, size, out);
    at += size + GAP;
  }
}

function grid(id: string, label: string, root: Node): PhotoLayout {
  const rects: Rect[] = [];
  fill(root, AREA.x, AREA.y, AREA.w, AREA.h, rects);
  return { id, n: rects.length, label, rects };
}

function loose(id: string, label: string, rects: Rect[]): PhotoLayout {
  return { id, n: rects.length, label, rects: rects.map((r) => ({ frame: "polaroid" as Frame, ...r })) };
}

export const PHOTO_LAYOUTS: PhotoLayout[] = [
  grid("1-full", "На всю страницу", "p"),
  loose("1-polaroid", "Полароид", [{ x: 17, y: 14, w: 66, h: 64, rotate: -2 }]),
  grid("2-cols", "Рядом", H("p", "p")),
  grid("2-rows", "Друг над другом", V("p", "p")),
  grid("2-big-left", "Большое и малое", H([2, "p"], "p")),
  grid("2-big-top", "Широкое сверху", V([2, "p"], "p")),
  loose("2-tilt", "Два полароида", [
    { x: 8, y: 9, w: 56, h: 50, rotate: -4 },
    { x: 34, y: 45, w: 56, h: 46, rotate: 3 },
  ]),
  grid("3-top", "Одно сверху, два снизу", V("p", H("p", "p"))),
  grid("3-bottom", "Два сверху, одно снизу", V(H("p", "p"), "p")),
  grid("3-left", "Одно слева, два справа", H("p", V("p", "p"))),
  grid("3-right", "Два слева, одно справа", H(V("p", "p"), "p")),
  grid("3-rows", "Три полосы", V("p", "p", "p")),
  grid("3-cols", "Три столбца", H("p", "p", "p")),
  loose("3-tilt", "Три полароида", [
    { x: 7, y: 8, w: 46, h: 40, rotate: -5 },
    { x: 48, y: 22, w: 46, h: 40, rotate: 4 },
    { x: 20, y: 54, w: 52, h: 38, rotate: -2 },
  ]),
  grid("4-quad", "Четыре поровну", V(H("p", "p"), H("p", "p"))),
  grid("4-top-three", "Широкое и три", V([2, "p"], H("p", "p", "p"))),
  grid("4-left-three", "Большое и три сбоку", H([2, "p"], V("p", "p", "p"))),
  grid("4-strips", "Четыре полосы", V("p", "p", "p", "p")),
  grid("4-cols", "Четыре столбца", H("p", "p", "p", "p")),
  grid("4-mosaic", "Мозаика", H(V([2, "p"], "p"), V("p", [2, "p"]))),
  grid("5-two-three", "Два и три", V(H("p", "p"), H("p", "p", "p"))),
  grid("5-three-two", "Три и два", V(H("p", "p", "p"), H("p", "p"))),
  grid("5-left-four", "Большое и четыре", H([2, "p"], V("p", "p", "p", "p"))),
  grid("5-hero", "Герой и четыре", V([2, "p"], H("p", "p", "p", "p"))),
  grid("6-3x2", "Шесть: три на два", V(H("p", "p", "p"), H("p", "p", "p"))),
  grid("6-2x3", "Шесть: два на три", H(V("p", "p", "p"), V("p", "p", "p"))),
  grid("6-hero", "Большое и пять", V([2, "p"], H("p", "p", "p"), H("p", "p"))),
  grid("9-3x3", "Девять поровну", V(H("p", "p", "p"), H("p", "p", "p"), H("p", "p", "p"))),
];

export const LAYOUT_COUNTS = [...new Set(PHOTO_LAYOUTS.map((l) => l.n))].sort((a, b) => a - b);

/** Пустые рамки под фото; стоят друг над другом в порядке чтения. */
export function layoutSlots(layout: PhotoLayout, makeId: () => string): PageBlock[] {
  return layout.rects.map((r, i) => ({ id: makeId(), type: "slot", x: r.x, y: r.y, w: r.w, h: r.h, label: `Фото ${i + 1}`, frame: r.frame ?? "none", rotate: r.rotate ?? 0 }) as PageBlock);
}
