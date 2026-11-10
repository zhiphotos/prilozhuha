// Готовые макеты расположения фото, как в Canva: пустые рамки, в каждую нажатием кладётся своё фото.
import type { PageBlock, PhotoShape } from "@/lib/rod/types";

type Node = "p" | { dir: "h" | "v"; items: [number, Node][] };
type Frame = Extract<PageBlock, { type: "slot" }>["frame"];
type Rect = { x: number; y: number; w: number; h: number; rotate?: number; frame?: Frame; shape?: PhotoShape };
/** Текст в макете: пустое поле с подсказкой, пишется прямо на странице. */
type Line = { x: number; y: number; w: number; hint: string; font?: "script" | "sans"; size?: "sm" | "md" | "lg"; align?: "left" | "center" };

export type PhotoLayout = { id: string; n: number; label: string; rects: Rect[]; texts?: Line[] };

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

/** Свободные рамки без полароида (круг, овал, арка) и подписи к ним. */
function shaped(id: string, label: string, rects: Rect[], texts: Line[] = []): PhotoLayout {
  return { id, n: rects.length, label, rects: rects.map((r) => ({ frame: "none" as Frame, ...r })), texts };
}

const title = (y: number, hint = "Заголовок"): Line => ({ x: 10, y, w: 80, hint, font: "script", size: "lg", align: "center" });
const note = (y: number, hint = "Пара слов об этом дне", x = 14, w = 72): Line => ({ x, y, w, hint, font: "sans", size: "sm", align: "center" });

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
  shaped("1-circle", "Круг и подпись", [{ x: 17, y: 8, w: 66, h: 66, shape: "round" }], [title(77), note(87)]),
  shaped("1-oval", "Овал и подпись", [{ x: 22, y: 8, w: 56, h: 68, shape: "round" }], [title(78), note(88)]),
  shaped("1-arch", "Арка и подпись", [{ x: 20, y: 7, w: 60, h: 70, shape: "arch" }], [title(79), note(89)]),
  shaped("1-rounded-text", "Фото и текст", [{ x: 8, y: 8, w: 84, h: 52, shape: "rounded" }], [title(63), note(73, "Расскажите историю этого кадра", 10, 80)]),
  shaped("2-circles", "Два круга", [{ x: 8, y: 12, w: 44, h: 44, shape: "round" }, { x: 48, y: 36, w: 44, h: 44, shape: "round" }], [{ x: 8, y: 64, w: 38, hint: "Подпись", font: "script", size: "md" }, { x: 54, y: 84, w: 38, hint: "Подпись", font: "script", size: "md", align: "center" }]),
  shaped("2-arches", "Две арки", [{ x: 9, y: 9, w: 39, h: 62, shape: "arch" }, { x: 52, y: 9, w: 39, h: 62, shape: "arch" }], [title(76), note(86)]),
  shaped("2-oval-text", "Овал и рассказ", [{ x: 6, y: 10, w: 46, h: 58, shape: "round" }], [{ x: 56, y: 14, w: 38, hint: "Имя", font: "script", size: "lg" }, { x: 56, y: 30, w: 38, hint: "Что здесь происходит", font: "sans", size: "sm" }]),
  shaped("3-circles", "Три круга в ряд", [{ x: 5, y: 34, w: 29, h: 29, shape: "round" }, { x: 35.5, y: 34, w: 29, h: 29, shape: "round" }, { x: 66, y: 34, w: 29, h: 29, shape: "round" }], [title(12, "Название"), note(72, "Подписи и даты", 8, 84)]),
  shaped("3-arches", "Три арки", [{ x: 6, y: 12, w: 28, h: 56, shape: "arch" }, { x: 36, y: 12, w: 28, h: 56, shape: "arch" }, { x: 66, y: 12, w: 28, h: 56, shape: "arch" }], [title(74), note(85)]),
  shaped("3-big-circle", "Большой круг и два малых", [{ x: 8, y: 8, w: 62, h: 62, shape: "round" }, { x: 62, y: 56, w: 30, h: 30, shape: "round" }, { x: 10, y: 66, w: 24, h: 24, shape: "round" }], [{ x: 38, y: 80, w: 28, hint: "Подпись", font: "script", size: "md" }]),
  shaped("4-circles", "Четыре круга", [{ x: 7, y: 10, w: 41, h: 41, shape: "round" }, { x: 52, y: 10, w: 41, h: 41, shape: "round" }, { x: 7, y: 52, w: 41, h: 41, shape: "round" }, { x: 52, y: 52, w: 41, h: 41, shape: "round" }]),
  shaped("4-rounded", "Мягкие углы, четыре", [{ x: 6, y: 7, w: 43.2, h: 41, shape: "rounded" }, { x: 50.8, y: 7, w: 43.2, h: 41, shape: "rounded" }, { x: 6, y: 50, w: 43.2, h: 41, shape: "rounded" }, { x: 50.8, y: 50, w: 43.2, h: 41, shape: "rounded" }]),
  shaped("2-rounded-title", "Заголовок и два фото", [{ x: 6, y: 22, w: 43.2, h: 52, shape: "rounded" }, { x: 50.8, y: 22, w: 43.2, h: 52, shape: "rounded" }], [title(7, "Заголовок страницы"), note(80, "Подпись под фото", 8, 84)]),
  shaped("3-polaroid-text", "Три фото и рассказ", [{ x: 6, y: 20, w: 28, h: 30, shape: "rounded" }, { x: 36, y: 20, w: 28, h: 30, shape: "rounded" }, { x: 66, y: 20, w: 28, h: 30, shape: "rounded" }], [title(7, "Заголовок"), { x: 8, y: 56, w: 84, hint: "Текст рассказа: что было, кто рядом, чем запомнилось", font: "sans", size: "md" }]),
  grid("9-3x3", "Девять поровну", V(H("p", "p", "p"), H("p", "p", "p"), H("p", "p", "p"))),
];

export const LAYOUT_COUNTS = [...new Set(PHOTO_LAYOUTS.map((l) => l.n))].sort((a, b) => a - b);

/** Пустые рамки под фото; стоят друг над другом в порядке чтения. */
export function layoutSlots(layout: PhotoLayout, makeId: () => string): PageBlock[] {
  const slots = layout.rects.map((r, i) => ({ id: makeId(), type: "slot", x: r.x, y: r.y, w: r.w, h: r.h, label: `Фото ${i + 1}`, frame: r.frame ?? "none", rotate: r.rotate ?? 0, ...(r.shape ? { shape: r.shape } : {}) }) as PageBlock);
  const texts = (layout.texts ?? []).filter((t) => t.hint).map((t) => ({ id: makeId(), type: "text", x: t.x, y: t.y, w: t.w, text: "", placeholder: t.hint, font: t.font ?? "sans", size: t.size ?? "md", ...(t.align ? { align: t.align } : {}) }) as PageBlock);
  return [...slots, ...texts];
}
