// Ручная расстановка схемы: поменять супругов местами и сдвинуть ветку влево или вправо.
// Считает, что записать людям (side, rank); сами правки пишет хранилище.
import { assignGenerations, layoutTree } from "./layout.ts";
import type { Person, Union } from "./types.ts";

export type Patch = { id: string; side?: "left" | "right" | null; rank?: number };

/** Поменять человека и его супруга местами: если он стоял слева, встанет справа, и наоборот. */
export function flipSpouse(people: Person[], unions: Union[], focusId: string, personId: string): Patch[] {
  const union = unions.find((u) => u.partnerIds.includes(personId) && u.partnerIds.length >= 2);
  const partnerId = union?.partnerIds.find((id) => id !== personId);
  if (!union || !partnerId) return [];
  const nodes = new Map(layoutTree(people, unions, focusId).nodes.map((n) => [n.id, n]));
  const me = nodes.get(personId);
  const partner = nodes.get(partnerId);
  if (!me || !partner) return [];
  const nowLeft = me.x <= partner.x;
  return [
    { id: personId, side: nowLeft ? "right" : "left" },
    { id: partnerId, side: nowLeft ? "left" : "right" },
  ];
}

/** Верхний предок ветки человека: поднимаемся по его родителям, пока они есть. */
function branchRoot(unions: Union[], personId: string): string {
  const seen = new Set<string>();
  let current = personId;
  while (!seen.has(current)) {
    seen.add(current);
    const parentUnion = unions.find((u) => u.childIds.includes(current) && u.partnerIds.length > 0);
    if (!parentUnion) break;
    current = parentUnion.partnerIds[0]!;
  }
  return current;
}

/**
 * Сдвинуть ветку человека на одно место влево или вправо среди веток своего ряда.
 * Ветка = самый старший предок человека вместе с супругой; её дети и родные идут следом.
 */
export function moveBranch(people: Person[], unions: Union[], focusId: string, personId: string, dir: -1 | 1): Patch[] {
  const root = branchRoot(unions, personId);
  const gen = assignGenerations(people, unions);
  const level = gen.get(root);
  if (level === undefined) return [];
  const x = new Map(layoutTree(people, unions, focusId).nodes.map((n) => [n.id, n.x]));
  // Ветки ряда: люди одного поколения, соединённые браком, считаются одной веткой.
  const row = people.filter((p) => gen.get(p.id) === level && x.has(p.id)).sort((a, b) => (x.get(a.id) ?? 0) - (x.get(b.id) ?? 0));
  const blockOf = new Map<string, number>();
  const blocks: string[][] = [];
  for (const person of row) {
    if (blockOf.has(person.id)) continue;
    const members = [person.id];
    blockOf.set(person.id, blocks.length);
    for (let i = 0; i < members.length; i++) {
      for (const u of unions) {
        if (!u.partnerIds.includes(members[i]!)) continue;
        for (const other of u.partnerIds) {
          if (gen.get(other) === level && !blockOf.has(other) && x.has(other)) {
            blockOf.set(other, blocks.length);
            members.push(other);
          }
        }
      }
    }
    blocks.push(members);
  }
  // Порядок блоков слева направо по самому левому участнику.
  blocks.sort((a, b) => Math.min(...a.map((id) => x.get(id) ?? 0)) - Math.min(...b.map((id) => x.get(id) ?? 0)));
  const at = blocks.findIndex((block) => block.includes(root));
  const to = at + dir;
  if (at < 0 || to < 0 || to >= blocks.length) return [];
  const order = blocks.slice();
  [order[at], order[to]] = [order[to]!, order[at]!];
  return order.flatMap((block, i) => block.map((id) => ({ id, rank: i * 10 })));
}
