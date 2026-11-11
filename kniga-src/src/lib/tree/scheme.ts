// «Схема» с ручными сдвигами: единственное место, откуда все стили, печать и сохранение берут расстановку карточек.
import { layoutTree } from "./layout.ts";
import { applyShifts, shiftsOf } from "./offsets.ts";
import type { Person, TreeLayout, Union } from "./types.ts";
import type { Spot } from "./anchor.ts";

export function schemeLayout(people: Person[], unions: Union[], focusId: string, flow?: "down" | "up"): TreeLayout {
  return applyShifts(layoutTree(people, unions, focusId, flow), unions, shiftsOf(people));
}

export function schemeAnchor(people: Person[], unions: Union[], focusId: string, flow?: "down" | "up"): Map<string, Spot> {
  return new Map(schemeLayout(people, unions, focusId, flow).nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
}
