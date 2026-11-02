import type { Union } from "./types.ts";

/**
 * Линии, которые подсвечиваются, когда в древе выбран человек: его родительская скобка (вместе с братьями и сёстрами),
 * родительские скобки всех его предков выше, его браки и скобки детей, а также браки и скобки всех потомков ниже.
 * Возвращает id союзов; рисующий код подсвечивает их линии брака и скобки детей.
 */
export function lineageUnionIds(unions: Union[], personId: string): Set<string> {
  const out = new Set<string>();
  const seenUp = new Set<string>();
  const up = [personId];
  while (up.length) {
    const id = up.pop()!;
    if (seenUp.has(id)) continue;
    seenUp.add(id);
    for (const un of unions) {
      if (!un.childIds.includes(id)) continue;
      out.add(un.id);
      for (const partner of un.partnerIds) up.push(partner);
    }
  }
  const seenDown = new Set<string>();
  const down = [personId];
  while (down.length) {
    const id = down.pop()!;
    if (seenDown.has(id)) continue;
    seenDown.add(id);
    for (const un of unions) {
      if (!un.partnerIds.includes(id)) continue;
      out.add(un.id);
      for (const child of un.childIds) down.push(child);
    }
  }
  return out;
}
