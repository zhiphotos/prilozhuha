export type EdgeBox = { x: number; y: number; w: number; h: number };
export type Edge = "l" | "r" | "t" | "b";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Размер рамки при перетаскивании за сторону. Правая и нижняя сторона двигают только свою границу,
 * левая и верхняя меняют размер и сдвигают рамку так, чтобы противоположная сторона осталась на месте.
 * dx, dy: сдвиг указателя в процентах страницы (ширины и высоты).
 */
export function resizeByEdge(box: EdgeBox, edge: Edge, dx: number, dy: number): EdgeBox {
  const w = edge === "r" ? clamp(box.w + dx, 3, 160) : edge === "l" ? clamp(box.w - dx, 3, 160) : box.w;
  const h = edge === "b" ? clamp(box.h + dy, 2, 160) : edge === "t" ? clamp(box.h - dy, 2, 160) : box.h;
  return { w, h, x: edge === "l" ? box.x + (box.w - w) : box.x, y: edge === "t" ? box.y + (box.h - h) : box.y };
}
