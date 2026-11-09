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
 * Сдвинуть ветку человека влево или вправо среди братьев и сестёр.
 * Ветка = человек вместе с семьёй и потомками. «Правее» меняет его местами с соседним братом или сестрой (детьми тех же родителей), больше ничего не двигается.
 * Порядок записывается только самим братьям и сёстрам (rank), поэтому другие ряды и стороны отца и матери не страдают.
 * У самого левого (правого) среди братьев и сестёр правок нет: приложение честно говорит «крайняя».
 * Если у человека нет братьев и сестёр, двигаем семью его родителей среди их братьев и сестёр, а если и там никого, ветку среди корней ряда.
 */
export function moveBranch(people: Person[], unions: Union[], focusId: string, personId: string, dir: -1 | 1): Patch[] {
  const candidates: string[] = [...branchChain(unions, personId)];
  // Человек пришёл в семью со стороны: двигается семья его супруга среди братьев и сестёр супруга.
  for (const u of unions) {
    if (!u.partnerIds.includes(personId)) continue;
    for (const other of u.partnerIds) if (other !== personId) candidates.push(...branchChain(unions, other));
  }
  for (const root of candidates) {
    const result = moveAmongSiblings(people, unions, focusId, root, dir);
    if (result !== null) return result;
  }
  for (const root of candidates) {
    const patches = moveBranchAt(people, unions, focusId, root, dir);
    if (patches.length) return patches;
  }
  return [];
}

/** null: у человека нет братьев и сестёр, двигать не с кем. Пустой список: он крайний или перестановка не получилась. */
function moveAmongSiblings(people: Person[], unions: Union[], focusId: string, personId: string, dir: -1 | 1): Patch[] | null {
  const layout = layoutTree(people, unions, focusId);
  const before = new Map(layout.nodes.map((n) => [n.id, n.x]));
  // Люди, чьи родители стоят далеко (связь не нарисована), не стоят среди своих братьев и сестёр: двигать их с ними бессмысленно.
  const far = new Set(layout.detached ?? []);
  if (far.has(personId)) return null;
  const siblings = [...new Set(unions.filter((u) => u.childIds.includes(personId)).flatMap((u) => u.childIds))].filter((id) => !far.has(id));
  if (siblings.length < 2) return null;
  const order = siblings.filter((id) => before.has(id)).sort((a, b) => before.get(a)! - before.get(b)! || a.localeCompare(b));
  const at = order.indexOf(personId);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= order.length) return [];
  const next = order.slice();
  [next[at], next[to]] = [next[to]!, next[at]!];
  const patches: Patch[] = next.map((id, i) => ({ id, rank: i * 10 }));
  // Проверка на самой раскладке: после правки братья и сёстры стоят ровно в новом порядке.
  const after = new Map(layoutTree(withPatches(people, patches), unions, focusId).nodes.map((n) => [n.id, n.x]));
  const got = next.slice().sort((a, b) => (after.get(a) ?? Number.NaN) - (after.get(b) ?? Number.NaN));
  return got.every((id, i) => id === next[i]) ? patches : [];
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
