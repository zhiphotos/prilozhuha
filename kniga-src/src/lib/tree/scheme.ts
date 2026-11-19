// «Схема» с ручными сдвигами: единственное место, откуда все стили, печать и сохранение берут расстановку карточек.
import { layoutTree } from "./layout.ts";
import { applyShifts, shiftsOf } from "./offsets.ts";
import type { Person, TreeLayout, Union } from "./types.ts";
import type { Spot } from "./anchor.ts";
import { buildLayout, type AppLayout } from "./layout-engine.ts";

export function schemeLayout(people: Person[], unions: Union[], focusId: string, flow?: "down" | "up"): TreeLayout {
  return applyShifts(layoutTree(people, unions, focusId, flow), unions, shiftsOf(people));
}

export function schemeAnchor(people: Person[], unions: Union[], focusId: string, flow?: "down" | "up"): Map<string, Spot> {
  return new Map(schemeLayout(people, unions, focusId, flow).nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}

/** Расстановка для экспорта: та же, что на экране. `family` (по выбору на экране) строится через `buildLayout`, иначе прежняя «Схема». Ручные сдвиги применяются в обоих случаях. */
export type ExportSource = { people: Person[]; unions: Union[]; focusId: string; engine?: "classic" | "family"; ownerId?: string };
export function exportLayout(data: ExportSource, flow?: "down" | "up"): TreeLayout & Partial<AppLayout> {
  if (data.engine === "family") {
    const ownerId = data.ownerId && data.people.some((p) => p.id === data.ownerId) ? data.ownerId : data.focusId;
    return applyShifts(buildLayout(data.people, data.unions, data.focusId, flow ?? "down", { engine: "family", ownerId }), data.unions, shiftsOf(data.people));
  }
  return schemeLayout(data.people, data.unions, data.focusId, flow);
}
