// Ручки по сторонам: какие стороны у какого блока можно тянуть и как меняется рамка. Сам расчёт сторон лежит в edge-resize.ts.
import { resizeByEdge, type Edge } from "@/lib/rod/edge-resize";
import type { PageBlock } from "@/lib/rod/types";

export type SizedBox = { x: number; y: number; w: number; h: number | null };

/** Стороны, за которые можно тянуть блок. Повёрнутые блоки тянутся только углом: у них стороны не совпадают с осями страницы. */
export function edgesFor(block: Pick<PageBlock, "type"> & { rotate?: number }): Edge[] {
  if (Math.abs(block.rotate ?? 0) >= 2) return [];
  switch (block.type) {
    case "photo":
    case "slot":
    case "shape":
      return ["l", "r", "t", "b"];
    case "text":
    case "sticker":
      return ["l", "r"]; // у текста и стикера высота получается из ширины
    default:
      return [];
  }
}

/** Новая рамка при перетаскивании за сторону. Если высоты нет (текст, стикер), меняется только ширина. */
export function applyEdge(box: SizedBox, edge: Edge, dx: number, dy: number): SizedBox {
  if (box.h === null) {
    if (edge !== "l" && edge !== "r") return box;
    const next = resizeByEdge({ x: box.x, y: box.y, w: box.w, h: 10 }, edge, dx, 0);
    return { ...box, x: next.x, w: next.w };
  }
  return { ...box, ...resizeByEdge({ x: box.x, y: box.y, w: box.w, h: box.h }, edge, dx, dy) };
}
