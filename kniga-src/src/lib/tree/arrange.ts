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

/** Цепочка от самого человека вверх по родителям: человек, его родитель, родитель родителя и так далее. */
function branchChain(unions: Union[], personId: string): string[] {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = personId;
  while (!seen.has(current)) {
    seen.add(current);
    chain.push(current);
    const parentUnion = unions.find((u) => u.childIds.includes(current) && u.partnerIds.length > 0);
    if (!parentUnion) break;
    current = parentUnion.partnerIds[0]!;
  }
  return chain;
}

/** Что получится, если применить правки к людям: те же люди с новыми side и rank. */
function withPatches(people: Person[], patches: Patch[]): Person[] {
  return people.map((p) => {
    const patch = patches.find((q) => q.id === p.id);
    if (!patch) return p;
    return { ...p, ...("side" in patch ? { side: patch.side ?? undefined } : {}), ...(patch.rank !== undefined ? { rank: patch.rank } : {}) };
  });
}

/**
 * Сдвинуть ветку человека влево или вправо среди веток своего ряда.
 * Ветка = семья человека (он с супругом), а если она уже не двигается, семья его родителей и так далее вверх; дети и родные идут следом.
 * Раскладка учитывает ручной порядок (rank) только для самостоятельных веток, а сторона отца и матери главнее него.
 * Поэтому правка проверяется на самой раскладке: берётся первая перестановка (на одно место, на два и так далее),
 * после которой ветка действительно сдвинулась в нужную сторону. Если такой нет, правок нет, и приложение говорит об этом человеку.
 */
export function moveBranch(people: Person[], unions: Union[], focusId: string, personId: string, dir: -1 | 1): Patch[] {
  // Сначала пробуем сдвинуть саму семью человека среди братьев и сестёр, потом ветку его родителей, потом выше: берём первое, что действительно меняет раскладку.
  for (const root of branchChain(unions, personId)) {
    const patches = moveBranchAt(people, unions, focusId, root, dir);
    if (patches.length) return patches;
  }
  return [];
}

function moveBranchAt(people: Person[], unions: Union[], focusId: string, root: string, dir: -1 | 1): Patch[] {
  const gen = assignGenerations(people, unions);
  const level = gen.get(root);
  if (level === undefined) return [];
  const before = layoutTree(people, unions, focusId);
  const x = new Map(before.nodes.map((n) => [n.id, n.x]));
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
  if (at < 0) return [];
  const here = Math.min(...blocks[at]!.map((id) => x.get(id) ?? 0));
  for (let step = 1; at + dir * step >= 0 && at + dir * step < blocks.length; step += 1) {
    const to = at + dir * step;
    const order = blocks.slice();
    const [moved] = order.splice(at, 1);
    order.splice(to, 0, moved!);
    const patches: Patch[] = order.flatMap((block, i) => block.map((id) => ({ id, rank: i * 10 })));
    const after = new Map(layoutTree(withPatches(people, patches), unions, focusId).nodes.map((n) => [n.id, n.x]));
    const now = Math.min(...blocks[at]!.map((id) => after.get(id) ?? Number.NaN));
    if (Number.isFinite(now) && (now - here) * dir > 1) return patches;
  }
  return [];
}
