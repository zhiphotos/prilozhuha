import { yearNum } from "./kinship.ts";
import { H_GAP, PAD_X, PAD_Y, PLATE_GAP, PLATE_H, PLATE_W, PORTRAIT_R, ROOT_GAP, ROW_H, SPOUSE_DX } from "./metrics.ts";
import type { ChildBus, GenLabel, Person, SpouseLink, TreeData, TreeLayout, Union } from "./types.ts";

/** Насколько разводить ветки друг от друга: 0 плотно, 1 шире, 2 ещё шире. Выбирает пользователь. */
let spread: 0 | 1 | 2 = 0;
const STRAIGHT_SPINE = false;
/** Проверено замером на её GED: оба приёма не улучшают, а ухудшают раскладку (длиннее линии, нарушается порядок по возрасту). Оставлены выключенными. */
const PULL_EDGE = false;
/** Насколько семья супруга тянется к паре (подобрано замером на её GED: братья и сёстры собираются, а ветки не разъезжаются по ширине). */
const ATTRACT = 12;
/** Ребёнок под родителями: проверено на её большом GED (1264 человека), где это удлиняет линии, поэтому только для обычных древ тестировщиц (до 300 человек): там дети иначе уезжают от родителей, а линии идут через чужих. */
const PARENTS_FIRST = false;
const PARENTS_FIRST_MAX = 300;
const SPREAD_EXTRA = [0, 90, 220] as const;
export function setLayoutSpread(value: 0 | 1 | 2) {
  spread = value;
}

type Graph = {
  people: Map<string, Person>;
  unions: Union[];
  parentOf: Map<string, string[]>;
  marriagesOf: Map<string, Union[]>;
};

function graph(people: Person[], unions: Union[]): Graph {
  const parentOf = new Map<string, string[]>();
  const marriagesOf = new Map<string, Union[]>();
  for (const union of unions) {
    for (const id of union.partnerIds) {
      const list = marriagesOf.get(id) ?? [];
      list.push(union);
      marriagesOf.set(id, list);
    }
    for (const child of union.childIds) {
      const list = parentOf.get(child) ?? [];
      for (const id of union.partnerIds) if (!list.includes(id)) list.push(id);
      parentOf.set(child, list);
    }
  }
  return { people: new Map(people.map((p) => [p.id, p])), unions, parentOf, marriagesOf };
}

function byBirth(g: Graph, a: string, b: string): number {
  const ya = yearNum(g.people.get(a)?.birthYear);
  const yb = yearNum(g.people.get(b)?.birthYear);
  if (ya !== yb) return ya - yb;
  return (g.people.get(a)?.firstName ?? "").localeCompare(g.people.get(b)?.firstName ?? "", "ru");
}

export function assignGenerations(people: Person[], unions: Union[]): Map<string, number> {
  const g = graph(people, unions);
  const adj = new Map<string, { id: string; d: number }[]>();
  const link = (a: string, b: string, d: number) => {
    const list = adj.get(a) ?? [];
    list.push({ id: b, d });
    adj.set(a, list);
  };
  for (const union of unions) {
    if (union.partnerIds.length >= 2) {
      const [a, b] = union.partnerIds;
      link(a!, b!, 0);
      link(b!, a!, 0);
    }
    for (const parent of union.partnerIds) {
      for (const child of union.childIds) {
        link(parent, child, 1);
        link(child, parent, -1);
      }
    }
  }
  const gen = new Map<string, number>();
  for (const person of people) {
    if (gen.has(person.id)) continue;
    gen.set(person.id, 0);
    const queue = [person.id];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!;
      const base = gen.get(id)!;
      for (const edge of adj.get(id) ?? []) {
        if (gen.has(edge.id)) continue;
        gen.set(edge.id, base + edge.d);
        queue.push(edge.id);
      }
    }
  }
  // Противоречие (например, дядя женат на племяннице): ребёнок не может оказаться в одном ряду с родителем или выше. Подтягиваем вниз, пока каждый ребёнок не станет строго ниже родителя, а супруги не окажутся в одном ряду. Связи не меняются, только строка.
  // Подтяжка работает на копии и применяется, только если сошлась. Если связи образуют круг (человек сам себе предок, родитель и супруг одновременно), подтяжка не заканчивается: ряды растут без конца и схема растягивается на тысячи пикселей пустоты. Тогда остаются обычные ряды, а противоречие показывает плашка.
  const limit = people.length + 5;
  const fixed = new Map(gen);
  let settled = false;
  for (let round = 0; round < limit; round++) {
    let changed = false;
    for (const union of unions) {
      const partners = union.partnerIds.filter((id) => fixed.has(id));
      if (partners.length >= 2) {
        const top = Math.max(...partners.map((id) => fixed.get(id)!));
        for (const id of partners) if (fixed.get(id) !== top) { fixed.set(id, top); changed = true; }
      }
      const parentRow = partners.length ? Math.max(...partners.map((id) => fixed.get(id)!)) : null;
      if (parentRow === null) continue;
      for (const child of union.childIds) {
        if (fixed.has(child) && fixed.get(child)! <= parentRow) { fixed.set(child, parentRow + 1); changed = true; }
      }
    }
    if (!changed) { settled = true; break; }
  }
  if (settled) for (const [id, value] of fixed) gen.set(id, value);
  let min = Infinity;
  for (const value of gen.values()) min = Math.min(min, value);
  if (!Number.isFinite(min)) min = 0;
  for (const [id, value] of gen) gen.set(id, value - min);
  return gen;
}

function marriageYear(g: Graph, a: string, b: string): number {
  const union = g.unions.find((u) => u.partnerIds.includes(a) && u.partnerIds.includes(b));
  return yearNum(union?.startYear) === 9999 ? yearNum(g.people.get(b)?.birthYear) : yearNum(union?.startYear);
}

/** Место ветки, которое выбрал пользователь; без выбора такие ветки идут по году рождения после выбранных. */
function rankOf(g: Graph, ids: string[]): number {
  let best = Infinity;
  for (const id of ids) {
    const rank = g.people.get(id)?.rank;
    if (rank !== undefined && rank < best) best = rank;
  }
  return best;
}

function cmpRank(g: Graph, a: string[], b: string[]): number {
  const ra = rankOf(g, a);
  const rb = rankOf(g, b);
  if (ra === rb) return 0;
  return ra < rb ? -1 : 1;
}

function orderGroup(g: Graph, ids: string[]): string[] {
  if (ids.length <= 1) return ids;
  if (ids.length === 2) {
    const [a, b] = ids as [string, string];
    const pa = g.people.get(a);
    const pb = g.people.get(b);
    // Явный выбор пользователя главнее пола и возраста.
    if (pa?.side === "right" || pb?.side === "left") return [b, a];
    if (pa?.side === "left" || pb?.side === "right") return [a, b];
    if (pa?.gender === "m" && pb?.gender !== "m") return [a, b];
    if (pb?.gender === "m" && pa?.gender !== "m") return [b, a];
    return byBirth(g, a, b) <= 0 ? [a, b] : [b, a];
  }
  // Цепочка браков (Е – С – А – Д: у каждого из родителей есть второй брак): порядок идёт вдоль цепочки, текущая пара остаётся рядом, бывшие – по краям.
  {
    const set = new Set(ids);
    const nb = new Map<string, string[]>(ids.map((id) => [id, [...new Set((g.marriagesOf.get(id) ?? []).flatMap((u) => u.partnerIds).filter((o) => o !== id && set.has(o)))]]));
    const edges = [...nb.values()].reduce((n, l) => n + l.length, 0) / 2;
    const isPath = edges === ids.length - 1 && [...nb.values()].every((l) => l.length <= 2) && [...nb.values()].some((l) => l.length === 2) && ids.length >= 4;
    if (isPath) {
      const ends = ids.filter((id) => nb.get(id)!.length === 1);
      const walk = (start: string) => {
        const path = [start];
        while (true) {
          const next = nb.get(path[path.length - 1]!)!.find((o) => !path.includes(o));
          if (!next) return path;
          path.push(next);
        }
      };
      const a = walk(ends.slice().sort()[0]!);
      const b = a.slice().reverse();
      // Главной считается пара в середине цепочки (у обоих по несколько браков): в ней мужчина слева, как в любой родословной; крайние (бывшие) смотрят наружу.
      const score = (p: string[]) => p.slice(1).filter((id, i) => nb.get(p[i]!)!.length === 2 && nb.get(id)!.length === 2 && g.people.get(p[i]!)?.gender === "m" && g.people.get(id)?.gender === "f").length;
      return score(b) > score(a) ? b : a;
    }
  }
  const hub = ids.slice().sort((a, b) => (g.marriagesOf.get(b)?.length ?? 0) - (g.marriagesOf.get(a)?.length ?? 0) || byBirth(g, a, b))[0]!;
  // Ближе к главному стоит действующий брак, потом более ранний; бывшие супруги уходят наружу и не оказываются между ним и текущей парой.
  const unionWith = (a: string) => g.unions.find((u) => u.partnerIds.includes(hub) && u.partnerIds.includes(a));
  const current = (a: string) => (unionWith(a)?.status === "married" || unionWith(a)?.status === "partner" ? 0 : 1);
  const others = ids.filter((id) => id !== hub).sort((a, b) => current(a) - current(b) || marriageYear(g, hub, a) - marriageYear(g, hub, b) || byBirth(g, a, b) || a.localeCompare(b));
  if (others.length === 2) {
    // Два брака: в порядке заключения (при равных годах действующий слева, бывший справа).
    const chrono = others.slice().sort((a, b) => marriageYear(g, hub, a) - marriageYear(g, hub, b) || current(a) - current(b) || byBirth(g, a, b) || a.localeCompare(b));
    return [chrono[0]!, hub, chrono[1]!];
  }
  const left: string[] = [];
  const right: string[] = [];
  others.forEach((id, i) => (i % 2 === 0 ? left : right).push(id));
  return [...left.reverse(), hub, ...right];
}

function spouseGroups(g: Graph, ids: string[]): string[][] {
  const set = new Set(ids);
  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length) {
      const cur = queue.pop()!;
      group.push(cur);
      for (const union of g.marriagesOf.get(cur) ?? []) {
        for (const other of union.partnerIds) {
          if (!set.has(other) || seen.has(other)) continue;
          seen.add(other);
          queue.push(other);
        }
      }
    }
    groups.push(orderGroup(g, group));
  }
  return groups;
}

/**
 * Прямая линия «стержень»: от выбранного человека вверх по самой глубокой ветке предков
 * и вниз по самой многочисленной ветке потомков. Её ставим строго по вертикали,
 * остальные родственники расходятся по бокам.
 */
function spineOf(g: Graph, focusId: string): Map<string, string> {
  const up = new Map<string, number>();
  const depthUp = (id: string, seen = new Set<string>()): number => {
    if (up.has(id)) return up.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    let best = 0;
    for (const parent of g.parentOf.get(id) ?? []) best = Math.max(best, 1 + depthUp(parent, seen));
    up.set(id, best);
    return best;
  };
  const down = new Map<string, number>();
  const kidsOf = (id: string) => [...new Set((g.marriagesOf.get(id) ?? []).flatMap((u) => u.childIds))];
  const sizeDown = (id: string, seen = new Set<string>()): number => {
    if (down.has(id)) return down.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    let sum = 0;
    for (const kid of kidsOf(id)) sum += 1 + sizeDown(kid, seen);
    down.set(id, sum);
    return sum;
  };
  // result: человек -> его соседний по стержню «родитель» (тот, над кем он стоит)
  const spineParent = new Map<string, string>();
  let cur = focusId;
  for (let guard = 0; guard < 400; guard++) {
    const parents = (g.parentOf.get(cur) ?? []).slice().sort((a, b) => {
      const d = depthUp(b) - depthUp(a);
      if (d) return d;
      const ma = g.people.get(a)?.gender === "m" ? 0 : 1;
      const mb = g.people.get(b)?.gender === "m" ? 0 : 1;
      return ma - mb;
    });
    const next = parents[0];
    if (!next || spineParent.has(next) || next === focusId) break;
    spineParent.set(cur, next);
    cur = next;
  }
  cur = focusId;
  for (let guard = 0; guard < 400; guard++) {
    const kids = kidsOf(cur).slice().sort((a, b) => sizeDown(b) - sizeDown(a) || byBirth(g, a, b));
    const next = kids[0];
    if (!next || spineParent.has(next) || next === focusId) break;
    spineParent.set(next, cur);
    cur = next;
  }
  return spineParent;
}


// ——— Классическая раскладка: родословная ———
// Каждый человек стоит под серединой своих родителей. Пара, у которой у обоих есть родители, не стоит вплотную: каждый под своими родителями, между ними длинная линия брака, а их ребёнок под её серединой.
// Пара, у которой родители известны только у одного, стоит рядом. Дети одного брака по возрасту слева направо, их семьи под ними.
type Contour = Map<number, [number, number]>;
type Sub = { rel: Map<number, number>; contour: Contour };

/** Раскладка с повтором: пары, которые развели по родителям, но оказались слишком далеко друг от друга, снова ставим рядом. */
function tidyPositions(g: Graph, people: Person[], gen: Map<string, number>, focusId: string, extra: number): { pos: Map<string, number>; detached: Set<string> } | null {
  const banned = new Set<string>();
  // Предки выбранного человека всегда строго по восходящей схеме: каждый под своими родителями, без исключений и в большом древе.
  const strict = true;
  for (let attempt = 0; attempt < 6; attempt++) {
    const run = tidyOnce(g, people, gen, focusId, extra, banned, strict);
    if (!run) return null;
    if (!run.far.length) return { pos: run.pos, detached: run.detached };
    for (const key of run.far) banned.add(key);
  }
  const last = tidyOnce(g, people, gen, focusId, extra, new Set<string>([...banned, "*"]), false);
  return last ? { pos: last.pos, detached: last.detached } : null;
}

const SPLIT_LIMIT = 5 * (PLATE_W + H_GAP);
const PEDIGREE_MAX = 150;

function tidyOnce(g: Graph, people: Person[], gen: Map<string, number>, focusId: string, extra: number, banned: Set<string>, strict = false): { pos: Map<string, number>; far: string[]; detached: Set<string> } | null {
  const gap = PLATE_W + H_GAP;
  const levels = [...new Set([...gen.values()])].sort((a, b) => a - b);
  type Block = { index: number; ids: string[]; full: string[]; level: number; primary: string | null; parent: number | null; kids: number[]; ghostOf: number | null; splits: { ghost: number; side: -1 | 1; key: string }[] };
  const blocks: Block[] = [];
  const blockOf = new Map<string, number>();
  const hasParents = (id: string, level: number) => (g.parentOf.get(id) ?? []).some((q) => (gen.get(q) ?? -99) === level - 1);
  const spine = spineOf(g, focusId);
  const depthMemo = new Map<string, number>();
  const depthUp = (id: string, seen = new Set<string>()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    let best = 0;
    for (const parent of g.parentOf.get(id) ?? []) best = Math.max(best, 1 + depthUp(parent, seen));
    depthMemo.set(id, best);
    return best;
  };
  const betterPrimary = (a: string, b: string, order: string[]) => Number(spine.has(b)) - Number(spine.has(a)) || depthUp(b) - depthUp(a) || order.indexOf(a) - order.indexOf(b);
  for (const level of levels) {
    const ids = people.filter((p) => gen.get(p.id) === level).map((p) => p.id);
    for (const members of spouseGroups(g, ids)) {
      const index = blocks.length;
      blocks.push({ index, ids: members, full: members.slice(), level, primary: null, parent: null, kids: [], ghostOf: null, splits: [] });
      for (const id of members) blockOf.set(id, index);
    }
  }
  // Предки выбранного человека: только их пары разводим по своим родителям, как в восходящей схеме. У остальных (прежние мужья и жёны, родня со стороны) пара стоит рядом, иначе линии брака растягиваются через весь лист.
  const ancestors = new Set<string>();
  const upQueue = [focusId];
  for (let i = 0; i < upQueue.length; i++) {
    for (const parent of g.parentOf.get(upQueue[i]!) ?? []) {
      if (ancestors.has(parent)) continue;
      ancestors.add(parent);
      upQueue.push(parent);
    }
  }
  // Сколько людей в семье человека, кроме него самого и его потомков: братья, сёстры и их потомство. Если семья большая, разводить пару по родителям нельзя: линия брака растянется на весь лист.
  const familyMemo = new Map<string, number>();
  const kidsOf = (id: string) => [...new Set((g.marriagesOf.get(id) ?? []).flatMap((u) => u.childIds))];
  const descendants = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id) || seen.size > 40) return 0;
    seen.add(id);
    let total = 1;
    for (const kid of kidsOf(id)) total += descendants(kid, seen);
    return total;
  };
  const siblingsFamily = (id: string): number => {
    const cached = familyMemo.get(id);
    if (cached !== undefined) return cached;
    let total = 0;
    for (const parent of g.parentOf.get(id) ?? []) {
      for (const kid of kidsOf(parent)) if (kid !== id) total += descendants(kid);
      break;
    }
    familyMemo.set(id, total);
    return total;
  };
  const SMALL_FAMILY = 40;
  // Пара, у обоих есть родители: второй встаёт «призраком» под своими родителями, а сам брак тянется между ними.
  const real = blocks.length;
  for (let i = 0; i < real; i++) {
    const block = blocks[i]!;
    if (block.ids.length < 2 || banned.has("*")) continue;
    // Предки выбранного, у которых известны родители: каждый встаёт под своими, даже если в блоке несколько браков.
    const cands = block.ids.filter((id) => hasParents(id, block.level) && ancestors.has(id) && (strict || siblingsFamily(id) <= SMALL_FAMILY));
    if (cands.length < 2) continue;
    const order = block.ids.slice();
    // Главным остаётся тот, у кого несколько браков: остальные супруги стоят вокруг него и не оказываются рядом с чужим бывшим мужем или женой.
    const sorted = cands.slice().sort((a, b) => (g.marriagesOf.get(b)?.length ?? 0) - (g.marriagesOf.get(a)?.length ?? 0) || betterPrimary(a, b, order));
    const main = sorted[0]!;
    for (const other of sorted.slice(1)) {
      const key = [main, other].sort().join("+");
      if (banned.has(key)) continue;
      // Вместе с уходящим под своих родителей уходят и те, кто связан с блоком только через него (его второй муж или жена): иначе они остаются рядом с чужим человеком.
      const rest = block.ids.filter((id) => id !== other);
      const linked = (a: string) => (g.marriagesOf.get(a) ?? []).flatMap((u) => u.partnerIds).filter((o) => rest.includes(o));
      const keep = new Set<string>([main]);
      for (const q of [...keep]) for (const o of linked(q)) if (!keep.has(o)) { keep.add(o); q !== o && [...keep].includes(o); }
      for (let n = 0; n < rest.length; n++) for (const q of [...keep]) for (const o of linked(q)) keep.add(o);
      const withOther = rest.filter((id) => !keep.has(id));
      const gids = order.filter((id) => id === other || withOther.includes(id));
      const ghost: Block = { index: blocks.length, ids: gids, full: gids.slice(), level: block.level, primary: other, parent: null, kids: [], ghostOf: i, splits: [] };
      blocks.push(ghost);
      block.ids = block.ids.filter((id) => !gids.includes(id));
      for (const id of gids) blockOf.set(id, ghost.index);
      block.splits.push({ ghost: ghost.index, side: order.indexOf(other) < order.indexOf(main) ? -1 : 1, key });
      blockOf.set(other, ghost.index);
    }
  }
  const parentBlockOf = (id: string, level: number): number | null => {
    for (const parent of g.parentOf.get(id) ?? []) {
      if ((gen.get(parent) ?? -99) !== level - 1) continue;
      const at = blockOf.get(parent);
      if (at === undefined) continue;
      const owner = blocks[at]!.ghostOf;
      return owner ?? at;
    }
    return null;
  };
  for (const block of blocks) {
    if (block.ghostOf !== null) {
      block.parent = parentBlockOf(block.ids[0]!, block.level);
      continue;
    }
    const withParents = block.ids.filter((id) => parentBlockOf(id, block.level) !== null);
    if (!withParents.length) continue;
    withParents.sort((a, b) => betterPrimary(a, b, block.ids));
    block.primary = withParents[0]!;
    block.parent = parentBlockOf(block.primary, block.level);
  }
  for (const block of blocks) if (block.parent !== null) blocks[block.parent]!.kids.push(block.index);
  // Где стоит брак, из которого вышел ребёнок, среди участников блока (индекс супруга, у пары из двух – 0,5).
  /** Порядок детей по бракам блока считается по полному порядку супругов (в том числе ушедших под своих родителей). */
  const orderKey = (block: Block, kid: number) => {
    const k = blocks[kid]!;
    const who = (g.parentOf.get(k.primary ?? k.ids[0]!) ?? []).map((q) => block.full.indexOf(q)).filter((i) => i >= 0);
    return who.length ? who.reduce((sum, i) => sum + i, 0) / who.length : 0;
  };
  const marriageKey = (block: Block, kid: number) => {
    const k = blocks[kid]!;
    const who = (g.parentOf.get(k.primary ?? k.ids[0]!) ?? []).map((q) => block.ids.indexOf(q)).filter((i) => i >= 0);
    return who.length ? who.reduce((sum, i) => sum + i, 0) / who.length : 0;
  };
  // Порядок веток слева направо как в восходящей схеме: сторона отца целиком слева, сторона матери целиком справа, и так на каждом уровне (отец отца, мать отца, отец матери, мать матери...).
  const slot = new Map<string, number>();
  const bit = new Map<string, number>();
  const span = new Map<string, [number, number]>([[focusId, [0, 1]]]);
  slot.set(focusId, 0.5);
  const upQ = [focusId];
  for (let i = 0; i < upQ.length; i++) {
    const child = upQ[i]!;
    const [lo, hi] = span.get(child)!;
    const parents = [...new Set(g.parentOf.get(child) ?? [])].filter((q) => (gen.get(q) ?? -99) === (gen.get(child) ?? 0) - 1);
    parents.sort((a, b) => Number(g.people.get(a)?.gender !== "m") - Number(g.people.get(b)?.gender !== "m"));
    parents.forEach((parent, k) => {
      if (span.has(parent)) return;
      const half = parents.length > 1 ? (hi - lo) / 2 : hi - lo;
      const a = parents.length > 1 ? lo + k * half : lo;
      span.set(parent, [a, a + half]);
      slot.set(parent, a + half / 2);
      bit.set(parent, parents.length > 1 ? k : 0);
      upQ.push(parent);
    });
  }
  const isLine = (kid: number) => blocks[kid]!.ids.some((id) => id === focusId || ancestors.has(id));
  for (const block of blocks) {
    // Дети разных браков одного человека стоят группами в порядке супругов (дети первого брака, второго...), а не вперемешку по возрасту.
    block.kids.sort((a, b) => {
      const ka = blocks[a]!;
      const kb = blocks[b]!;
      return orderKey(block, a) - orderKey(block, b) || cmpRank(g, ka.ids, kb.ids) || byBirth(g, ka.primary ?? ka.ids[0]!, kb.primary ?? kb.ids[0]!);
    });
    // Прямой род по центру, боковые ветки в сторону: братья и сёстры предка стоят с внешней стороны от него (сторона отца слева, сторона матери справа), а сам он ближе к середине схемы.
    const line = block.kids.filter(isLine);
    const side = block.kids.filter((k) => !isLine(k));
    if (line.length && side.length) {
      // Сторона определяется положением в паре: отец пары слева (его братья и сёстры слева), мать справа (её справа). Так боковые ветки уходят от центра, а не оказываются между супругами.
      const person = line.flatMap((k) => blocks[k]!.ids).find((id) => bit.has(id));
      if (person !== undefined) block.kids = bit.get(person) === 0 ? [...side, ...line] : [...line, ...side];
    }
  }

  // Боковые ветки отдельно от прямого рода: братья и сёстры предков (и их потомство) не входят в дерево прямого рода, а стоят отдельной веткой рядом с ним, снаружи. Тогда прямой род узкий и родители выбранного стоят рядом над ним, а родня расходится в стороны. Свои братья и сёстры остаются под общими родителями.
  const cutSlot = new Map<number, number>();
  for (const block of blocks) {
    if (!isLine(block.index)) continue;
    const lineKids = block.kids.filter(isLine);
    const sideKids = block.kids.filter((k) => !isLine(k));
    if (!lineKids.length || !sideKids.length) continue;
    if (block.kids.some((k) => blocks[k]!.ids.includes(focusId))) continue;
    const ids = lineKids.flatMap((k) => blocks[k]!.ids);
    const person = ids.find((id) => bit.has(id));
    const dir = person !== undefined && bit.get(person) === 1 ? 1 : -1;
    // Боковые ветки уходят к краям: родня стороны отца левее всего прямого рода, стороны матери правее; чем старше предок, тем дальше от центра.
    const above = Math.max(1, (gen.get(focusId) ?? 0) - block.level);
    sideKids.forEach((k, i) => {
      blocks[k]!.parent = null;
      cutSlot.set(k, dir < 0 ? -1 - 0.1 * above - 0.0002 * i : 2 + 0.1 * above + 0.0002 * i);
    });
    block.kids = lineKids;
  }

  // Супруг из другой семьи (его родители стоят отдельной веткой): если они далеко, связь с ними не рисуем, иначе линия тянется через всю схему и пересекается с другими.
  const detached = new Set<string>();
  for (const block of blocks) {
    if (block.ghostOf !== null || !block.primary) continue;
    for (const id of block.ids) {
      // Предки и сам выбранный: их связь с родителями рисуется всегда.
      if (id === block.primary || id === focusId || ancestors.has(id)) continue;
      if (parentBlockOf(id, block.level) !== null) detached.add(id);
    }
  }

  const memo = new Map<number, Sub>();
  const build = (index: number): Sub => {
    const cached = memo.get(index);
    if (cached) return cached;
    const block = blocks[index]!;
    const half = (block.ids.length * gap) / 2;
    const rel = new Map<number, number>();
    const contour: Contour = new Map();
    const acc: Contour = new Map();
    const centers: number[] = [];
    for (const kid of block.kids) {
      const sub = build(kid);
      let shift = centers.length ? Number.NEGATIVE_INFINITY : 0;
      if (centers.length) {
        for (const [level, [lo]] of sub.contour) {
          const have = acc.get(level);
          if (have) shift = Math.max(shift, have[1] + extra - lo);
        }
        if (!Number.isFinite(shift)) shift = Math.max(...[...acc.values()].map((v) => v[1])) + gap;
      }
      centers.push(shift);
      for (const [id, x] of sub.rel) rel.set(id, x + shift);
      for (const [level, [lo, hi]] of sub.contour) {
        const have = acc.get(level);
        acc.set(level, have ? [Math.min(have[0], lo + shift), Math.max(have[1], hi + shift)] : [lo + shift, hi + shift]);
      }
    }
    // Родители стоят над самими детьми (их главные участники), а не над их парами: тогда один ребёнок оказывается ровно под серединой брака.
    const lean = (kid: number) => {
      const k = blocks[kid]!;
      const at = k.primary ? k.ids.indexOf(k.primary) : -1;
      return at < 0 ? 0 : (at - (k.ids.length - 1) / 2) * gap;
    };
    // Блок с несколькими браками: под своим браком стоят его дети (главный брак – тот, где ребёнок на линии выбранного, иначе где детей больше).
    let mid = 0;
    const lineIdx = block.kids.map((k, i) => (isLine(k) ? i : -1)).filter((i) => i >= 0);
    if (centers.length && lineIdx.length) {
      // Родители стоят прямо над своим ребёнком из прямого рода (над выбранным – над ним самим), а не над серединой всех детей.
      const ats = lineIdx.map((i) => centers[i]! + lean(block.kids[i]!));
      const key = marriageKey(block, block.kids[lineIdx[0]!]!);
      mid = (Math.min(...ats) + Math.max(...ats)) / 2 - (key - (block.ids.length - 1) / 2) * gap;
    } else if (centers.length) {
      const groups = new Map<number, { first: number; last: number; count: number; spine: boolean }>();
      block.kids.forEach((kid, i) => {
        const key = marriageKey(block, kid);
        const at = centers[i]! + lean(kid);
        const have = groups.get(key) ?? { first: at, last: at, count: 0, spine: false };
        have.first = Math.min(have.first, at);
        have.last = Math.max(have.last, at);
        have.count += 1;
        if (spine.has(blocks[kid]!.primary ?? blocks[kid]!.ids[0]!)) have.spine = true;
        groups.set(key, have);
      });
      const best = [...groups.entries()].sort((a, b) => Number(b[1].spine) - Number(a[1].spine) || b[1].count - a[1].count || a[0] - b[0])[0]!;
      mid = (best[1].first + best[1].last) / 2 - (best[0] - (block.ids.length - 1) / 2) * gap;
    }
    for (const [id, x] of rel) rel.set(id, x - mid);
    for (const [level, [lo, hi]] of acc) contour.set(level, [lo - mid, hi - mid]);
    rel.set(index, 0);
    const own = contour.get(block.level);
    contour.set(block.level, own ? [Math.min(own[0], -half), Math.max(own[1], half)] : [-half, half]);
    const sub = { rel, contour };
    memo.set(index, sub);
    return sub;
  };

  // Деревья: каждый корень (блок без родителей в древе) со всем своим потомством.
  const treeOf = new Map<number, number>();
  const roots = blocks.filter((b) => b.parent === null).map((b) => b.index);
  roots.sort((a, b) => cmpRank(g, blocks[a]!.ids, blocks[b]!.ids) || byBirth(g, blocks[a]!.ids[0]!, blocks[b]!.ids[0]!));
  roots.forEach((root, t) => {
    for (const id of build(root).rel.keys()) treeOf.set(id, t);
  });
  if (treeOf.size !== blocks.length) return null;

  // Связи между деревьями: пара пришла из другой семьи.
  type Link = { from: number; to: number; side: -1 | 1 };
  const links: Link[] = [];
  const addLink = (a: number, b: number, side: -1 | 1) => {
    const ta = treeOf.get(a)!;
    const tb = treeOf.get(b)!;
    if (ta === tb) return;
    links.push({ from: ta, to: tb, side });
    links.push({ from: tb, to: ta, side: side === -1 ? 1 : -1 });
  };
  for (const block of blocks) {
    for (const sp of block.splits) addLink(block.index, sp.ghost, sp.side);
    if (!block.primary || block.ghostOf !== null) continue;
    for (const id of block.ids) {
      if (id === block.primary) continue;
      const other = parentBlockOf(id, block.level);
      if (other === null) continue;
      addLink(block.index, other, block.ids.indexOf(id) < block.ids.indexOf(block.primary) ? -1 : 1);
    }
  }

  const focusBlock = blockOf.get(focusId) ?? 0;
  let top = blocks[focusBlock]!.ghostOf ?? focusBlock;
  for (let guard = 0; guard < 500 && blocks[top]!.parent !== null; guard++) top = blocks[top]!.parent!;
  const startTree = treeOf.get(top) ?? 0;

  const offset = new Map<number, number>();
  const acc: Contour = new Map();
  const put = (t: number, side: -1 | 1) => {
    const sub = build(roots[t]!);
    let at = 0;
    if (acc.size) {
      at = side === 1 ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
      for (const [level, [lo, hi]] of sub.contour) {
        const have = acc.get(level);
        if (!have) continue;
        at = side === 1 ? Math.max(at, have[1] + extra - lo) : Math.min(at, have[0] - extra - hi);
      }
      if (!Number.isFinite(at)) {
        const all = [...acc.values()];
        at = side === 1 ? Math.max(...all.map((v) => v[1])) + gap : Math.min(...all.map((v) => v[0])) - gap;
      }
    }
    offset.set(t, at);
    for (const [level, [lo, hi]] of sub.contour) {
      const have = acc.get(level);
      acc.set(level, have ? [Math.min(have[0], lo + at), Math.max(have[1], hi + at)] : [lo + at, hi + at]);
    }
  };
  const treeSlot = new Map<number, number>();
  roots.forEach((root, t) => {
    const keys = blocks[root]!.ids.map((id) => slot.get(id)).filter((v): v is number => v !== undefined);
    if (keys.length) treeSlot.set(t, Math.min(...keys));
    else if (cutSlot.has(root)) treeSlot.set(t, cutSlot.get(root)!);
  });
  // Ветки без предков выбранного (родня, пришедшая через брак) уходят в конец: между отцом и матерью выбранного должны стоять только их предки, иначе линия брака растягивается на весь лист.
  // Ветки, которые пользователь расставил сам (rank), главнее порядка по родословной.
  const order = roots.map((_, t) => t).sort((a, b) => {
    const ra = rankOf(g, blocks[roots[a]!]!.ids);
    const rb = rankOf(g, blocks[roots[b]!]!.ids);
    if (Number.isFinite(ra) && Number.isFinite(rb) && ra !== rb) return ra - rb;
    return (treeSlot.get(a) ?? 2) - (treeSlot.get(b) ?? 2) || a - b;
  });
  for (const t of order) put(t, 1);

  // Центры блоков.
  const cx = new Map<number, number>();
  roots.forEach((root, t) => {
    const at = offset.get(t) ?? 0;
    for (const [index, x] of build(root).rel) cx.set(index, at + x);
  });
  const below = (index: number, out: number[] = []): number[] => {
    for (const kid of blocks[index]!.kids) {
      out.push(kid);
      below(kid, out);
    }
    return out;
  };
  // Сверху вниз: дети разорванной пары встают под серединой между супругами, вместе со всем своим потомством.
  const splitBlocks = blocks.filter((b) => b.splits.length).sort((a, b) => a.level - b.level);
  for (const block of splitBlocks) {
    for (const sp of block.splits) {
      const a = cx.get(block.index);
      const b = cx.get(sp.ghost);
      if (a === undefined || b === undefined) continue;
      const shift = (b - a) / 2;
      if (!shift) continue;
      const ghostId = blocks[sp.ghost]!.primary ?? blocks[sp.ghost]!.ids[0]!;
      // Двигаем только детей этого брака (их родители включают ушедшего супруга), остальные дети блока остаются.
      for (const kid of block.kids) {
        const k = blocks[kid]!;
        if (!(g.parentOf.get(k.primary ?? k.ids[0]!) ?? []).includes(ghostId)) continue;
        for (const index of [kid, ...below(kid)]) cx.set(index, (cx.get(index) ?? 0) + shift);
      }
    }
  }
  // Вокруг выбранного и его братьев и сестёр держим свободную полосу: дальние родственники того же поколения (двоюродные, троюродные...) не должны стоять вплотную, иначе их линии сливаются с моими.
  {
    const meIdx = blockOf.get(focusId);
    const meBlock = meIdx === undefined ? undefined : (blocks[meIdx]!.ghostOf ?? meIdx);
    if (meBlock !== undefined && cx.has(meBlock)) {
      const family = new Set<number>([meBlock]);
      const parentIdx = blocks[meBlock]!.parent;
      if (parentIdx !== null) for (const kid of blocks[parentIdx]!.kids) family.add(kid);
      const inside = new Set<number>(family);
      for (const f of family) for (const d of below(f)) inside.add(d);
      const xsFam = [...family].map((f) => cx.get(f)).filter((v): v is number => v !== undefined);
      const buffer = 4 * gap;
      const lo = Math.min(...xsFam) - ((blocks[meBlock]!.ids.length * gap) / 2) - buffer;
      const hi = Math.max(...xsFam) + ((blocks[meBlock]!.ids.length * gap) / 2) + buffer;
      const mid = (lo + hi) / 2;
      const level = blocks[meBlock]!.level;
      const movers = blocks.filter((b) => b.level === level && !inside.has(b.index) && cx.has(b.index) && (cx.get(b.index)! + (b.ids.length * gap) / 2 > lo) && (cx.get(b.index)! - (b.ids.length * gap) / 2 < hi));
      for (const b of movers) {
        const half = (b.ids.length * gap) / 2;
        const x = cx.get(b.index)!;
        const shift = x < mid ? lo - half - x : hi + half - x;
        for (const index of [b.index, ...below(b.index)]) if (!inside.has(index)) cx.set(index, (cx.get(index) ?? 0) + shift);
      }
    }
  }
  // Если ряд стал теснее, раздвигаем: сдвигаем блок со всем его потомством вправо.
  for (const level of levels) {
    const row = blocks.filter((b) => b.level === level && cx.has(b.index)).sort((p, q) => cx.get(p.index)! - cx.get(q.index)!);
    let edge = Number.NEGATIVE_INFINITY;
    for (const block of row) {
      const half = (block.ids.length * gap) / 2;
      const left = cx.get(block.index)! - half;
      if (left < edge) {
        const push = edge - left;
        for (const index of [block.index, ...below(block.index)]) cx.set(index, (cx.get(index) ?? 0) + push);
      }
      edge = cx.get(block.index)! + half + extra;
    }
  }

  const pos = new Map<string, number>();
  for (const block of blocks) {
    const center = cx.get(block.index);
    if (center === undefined) return null;
    block.ids.forEach((id, i) => pos.set(id, center + (i - (block.ids.length - 1) / 2) * gap));
  }
  if (pos.size !== people.length || ![...pos.values()].every(Number.isFinite)) return null;
  const far: string[] = [];
  for (const block of blocks) {
    for (const sp of block.splits) {
      const a = cx.get(block.index);
      const b = cx.get(sp.ghost);
      if (a === undefined || b === undefined) continue;
      // Линия брака не должна идти за чужими карточками: если между супругами стоит кто-то ещё, или они слишком далеко, пару ставим рядом.
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const between = blocks.some((other) => other.level === block.level && other.index !== block.index && other.index !== sp.ghost && (cx.get(other.index) ?? Infinity) > lo + 1 && (cx.get(other.index) ?? -Infinity) < hi - 1);
      if (!strict && (Math.abs(a - b) > SPLIT_LIMIT || between)) far.push(sp.key);
    }
  }
  return { pos, far, detached };
}

function rowLabel(delta: number): string {
  if (delta === 0) return "Вы и ваши";
  const n = Math.abs(delta);
  if (delta < 0) return n === 1 ? "Родители" : n === 2 ? "Деды" : `${n} колено вверх`;
  return n === 1 ? "Дети" : n === 2 ? "Внуки" : `${n} колено вниз`;
}

/**
 * Раскладка читает готовые данные и не должна зависеть от порядка, в котором людей добавляли:
 * входные списки приводятся к стабильному порядку (по id), дальше работают те же правила, что и раньше.
 */
export function layoutTree(people: Person[], unions: Union[], focusId: string, flow: "down" | "up" = "down"): TreeLayout {
  const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const sortedUnions = [...unions].sort(byId).map((u) => ({ ...u, childIds: [...u.childIds].sort() }));
  return layoutCore([...people].sort(byId), sortedUnions, focusId, flow);
}

function layoutCore(people: Person[], unions: Union[], focusId: string, flow: "down" | "up"): TreeLayout {
  const g = graph(people, unions);
  const gen = assignGenerations(people, unions);
  const focusGen = gen.get(focusId) ?? 0;
  const levels = [...new Set([...gen.values()])].sort((a, b) => a - b);
  const pos = new Map<string, number>();
  const gap = PLATE_W + H_GAP;
  const spineParent = spineOf(g, focusId);

  const blocksOf = (level: number) => {
    const ids = people.filter((p) => gen.get(p.id) === level).map((p) => p.id);
    return spouseGroups(g, ids).map((idsOfGroup) => {
      const rel = new Map<string, number>();
      idsOfGroup.forEach((id, index) => rel.set(id, index * gap));
      return { ids: idsOfGroup, rel };
    });
  };

  const placeBlocks = (blocks: { ids: string[]; rel: Map<string, number> }[], anchorOf: (ids: string[]) => { id: string; target: number } | null) => {
    const ready = blocks.map((block) => ({ ...block, anchor: anchorOf(block.ids) }));
    ready.sort((a, b) => (a.anchor?.target ?? 0) - (b.anchor?.target ?? 0) || cmpRank(g, a.ids, b.ids) || byBirth(g, a.anchor?.id ?? a.ids[0]!, b.anchor?.id ?? b.ids[0]!));
    let cursor = Number.NEGATIVE_INFINITY;
    let index = 0;
    while (index < ready.length) {
      const target = ready[index]?.anchor?.target;
      let end = index + 1;
      while (end < ready.length && target != null && ready[end]?.anchor && Math.abs((ready[end]?.anchor?.target ?? 0) - target) < 1) end += 1;
      const cluster = ready.slice(index, end);
      const local = new Map<string, number>();
      let localCursor = 0;
      for (const block of cluster) {
        let minRel = 0;
        let maxRel = 0;
        for (const value of block.rel.values()) {
          minRel = Math.min(minRel, value);
          maxRel = Math.max(maxRel, value);
        }
        const origin = localCursor - minRel;
        for (const [id, value] of block.rel) local.set(id, origin + value);
        localCursor = origin + maxRel + gap;
      }
      const anchors = cluster.map((block) => block.anchor).filter((item): item is { id: string; target: number } => Boolean(item));
      const anchorXs = anchors.map((item) => local.get(item.id) ?? 0);
      const center = anchorXs.length ? (Math.min(...anchorXs) + Math.max(...anchorXs)) / 2 : 0;
      let shift = target != null ? target - center : 0;
      let minLocal = Infinity;
      let maxLocal = -Infinity;
      for (const value of local.values()) {
        minLocal = Math.min(minLocal, value);
        maxLocal = Math.max(maxLocal, value);
      }
      if (cursor !== Number.NEGATIVE_INFINITY && minLocal + shift < cursor) shift += cursor - (minLocal + shift);
      for (const [id, value] of local) pos.set(id, value + shift);
      cursor = maxLocal + shift + gap + SPREAD_EXTRA[spread];
      index = end;
    }
  };

  const alignSpine = (level: number) => {
    // Стержень стоит строго над своим предком: если ряд сдвинул его, раздвигаем остальных в стороны.
    for (const person of people) {
      if (gen.get(person.id) !== level) continue;
      const sp = spineParent.get(person.id);
      if (sp === undefined || !pos.has(sp)) continue;
      const want = pos.get(sp)!;
      const have = pos.get(person.id)!;
      const d = have - want;
      if (Math.abs(d) < 0.5) continue;
      // Пара стержня двигается вместе: супруги не отрываются друг от друга.
      const group = new Set<string>([person.id]);
      for (const union of g.marriagesOf.get(person.id) ?? []) for (const mate of union.partnerIds) if (gen.get(mate) === level) group.add(mate);
      for (const other of people) {
        if (gen.get(other.id) !== level) continue;
        const x = pos.get(other.id)!;
        if (group.has(other.id)) pos.set(other.id, x - d);
        else if (d > 0 && x < have) pos.set(other.id, x - d);
        else if (d < 0 && x > have) pos.set(other.id, x - d);
      }
    }
  };

  const tidyRun = tidyPositions(g, people, gen, focusId, SPREAD_EXTRA[spread]);
  const tidy = tidyRun?.pos ?? null;
  const detached = tidyRun?.detached ?? new Set<string>();
  if (tidy) for (const [id, x] of tidy) pos.set(id, x);
  if (!tidy) levels.forEach((level, index) => {
    const blocks = blocksOf(level);
    if (index === 0) {
      blocks.sort((a, b) => cmpRank(g, a.ids, b.ids) || byBirth(g, a.ids[0]!, b.ids[0]!));
      let cursor = 0;
      for (const block of blocks) {
        let maxRel = 0;
        for (const value of block.rel.values()) maxRel = Math.max(maxRel, value);
        for (const [id, value] of block.rel) pos.set(id, cursor + value);
        cursor += maxRel + Math.max(gap, ROOT_GAP) + SPREAD_EXTRA[spread];
      }
      return;
    }
    const childTarget = new Map<string, number>();
    for (const union of unions) {
      const parents = union.partnerIds.filter((id) => pos.has(id));
      if (!parents.length) continue;
      const mid = parents.reduce((sum, id) => sum + (pos.get(id) ?? 0), 0) / parents.length;
      for (const child of union.childIds) if (gen.get(child) === level) childTarget.set(child, mid);
    }
    // Пара встаёт так, чтобы родители каждого из супругов были над «своим» супругом: линии не перекрещиваются.
    for (const block of blocks) {
      if (block.ids.length > 1 && block.ids.every((id) => childTarget.has(id)) && !block.ids.some((id) => g.people.get(id)?.side)) {
        block.ids = block.ids.slice().sort((a, b) => (childTarget.get(a) ?? 0) - (childTarget.get(b) ?? 0));
        block.rel = new Map(block.ids.map((id, i) => [id, i * gap] as [string, number]));
      }
    }
    // Пара встаёт так, чтобы родители каждого из супругов были над «своим» супругом: линии не перекрещиваются.
    for (const block of blocks) {
      if (block.ids.length > 1 && block.ids.every((id) => childTarget.has(id)) && !block.ids.some((id) => g.people.get(id)?.side)) {
        block.ids = block.ids.slice().sort((a, b) => (childTarget.get(a) ?? 0) - (childTarget.get(b) ?? 0));
        block.rel = new Map(block.ids.map((id, i) => [id, i * gap] as [string, number]));
      }
    }
    placeBlocks(blocks, (ids) => {
      const anchored = ids.filter((id) => childTarget.has(id));
      if (!anchored.length) return null;
      const id = anchored.slice().sort((a, b) => ids.indexOf(a) - ids.indexOf(b))[Math.floor((anchored.length - 1) / 2)]!;
      const target = anchored.reduce((sum, item) => sum + (childTarget.get(item) ?? 0), 0) / anchored.length;
      return { id, target };
    });
    if (STRAIGHT_SPINE) alignSpine(level);
  });

  // Подтягиваем семьи друг к другу: ряды по очереди тянутся к родителям и детям, ветки одной семьи держатся рядом.
  const kidsOfPerson = (id: string) => [...new Set((g.marriagesOf.get(id) ?? []).flatMap((u) => u.childIds))];
  const sibCount = (id: string) => Math.max(0, ...(g.parentOf.get(id) ?? []).map((par) => kidsOfPerson(par).length));
  const depthMemo = new Map<string, number>();
  const ancestry = (id: string, seen = new Set<string>()): number => {
    if (depthMemo.has(id)) return depthMemo.get(id)!;
    if (seen.has(id)) return 0;
    seen.add(id);
    let best = 0;
    for (const parent of g.parentOf.get(id) ?? []) best = Math.max(best, 1 + ancestry(parent, seen));
    depthMemo.set(id, best);
    return best;
  };
  const refineLevel = (level: number, parentsFirst = false) => {
    const ids = people.filter((p) => gen.get(p.id) === level && pos.has(p.id)).map((p) => p.id);
    if (ids.length < 2) return;
    const blocks = spouseGroups(g, ids).map((members) => {
      const sorted = members.slice().sort((a, b) => pos.get(a)! - pos.get(b)!);
      const base = pos.get(sorted[0]!)!;
      return { ids: sorted, rel: sorted.map((id) => pos.get(id)! - base), base };
    });
    const clusterKey = (block: (typeof blocks)[number], index: number) => {
      let best: string | null = null;
      let bestCount = -1;
      for (const id of block.ids) {
        const parents = g.parentOf.get(id) ?? [];
        if (!parents.length) continue;
        const count = ancestry(id) * 10000 + sibCount(id);
        if (count > bestCount) {
          bestCount = count;
          best = parents.slice().sort().join("+");
        }
      }
      return best ?? `solo${index}`;
    };
    const keyMember = (block: (typeof blocks)[number]) => {
      let best: string | null = null;
      let bestCount = -1;
      for (const id of block.ids) {
        if (!(g.parentOf.get(id) ?? []).length) continue;
        const count = ancestry(id) * 10000 + sibCount(id);
        if (count > bestCount) {
          bestCount = count;
          best = id;
        }
      }
      return best;
    };
    const wish = (id: string): number | null => {
      const parents = (g.parentOf.get(id) ?? []).filter((q) => pos.has(q) && gen.get(q) === level - 1);
      const kids = kidsOfPerson(id).filter((q) => pos.has(q) && gen.get(q) === level + 1);
      const values: number[] = [];
      if (parents.length) values.push(parents.reduce((sum, q) => sum + pos.get(q)!, 0) / parents.length);
      if (parentsFirst && values.length) return values[0]!;
      if (kids.length) values.push(kids.reduce((sum, q) => sum + pos.get(q)!, 0) / kids.length);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    };
    const clusters = new Map<string, { key: string; blocks: typeof blocks; locals: number[]; width: number; shift: number }>();
    blocks.forEach((block, index) => {
      const key = clusterKey(block, index);
      const entry = clusters.get(key) ?? { key, blocks: [], locals: [], width: 0, shift: 0 };
      entry.blocks.push(block);
      clusters.set(key, entry);
    });
    // Семья супруга тянется к паре: братья и сёстры того, чьи родители стоят в другом месте, собираются рядом с ним.
    const pullers = new Map<string, number[]>();
    if (ATTRACT > 0) {
      blocks.forEach((block, index) => {
        const own = clusterKey(block, index);
        for (const id of block.ids) {
          const parents = (g.parentOf.get(id) ?? []).filter((q) => pos.has(q) && gen.get(q) === level - 1);
          if (!parents.length) continue;
          const key2 = parents.slice().sort().join("+");
          if (key2 === own) continue;
          const list2 = pullers.get(key2) ?? [];
          list2.push(pos.get(id)!);
          pullers.set(key2, list2);
        }
      });
    }
    const sep = gap + SPREAD_EXTRA[spread];
    const list = [...clusters.values()];
    for (const cluster of list) {
      cluster.blocks.sort((a, b) => {
        const ka = keyMember(a);
        const kb = keyMember(b);
        if (ka && kb) {
          const ra = cmpRank(g, [ka], [kb]);
          if (ra) return ra;
          const ya = yearNum(g.people.get(ka)?.birthYear);
          const yb = yearNum(g.people.get(kb)?.birthYear);
          if (ya !== 9999 && yb !== 9999 && ya !== yb) return ya - yb;
        }
        return a.base - b.base;
      });
      // Если у супруга в этой семье родители стоят далеко в стороне, пара встаёт с края, обращённого к ним: семьи супругов оказываются рядом.
      if (PULL_EDGE && cluster.blocks.length > 2) {
        const centre = cluster.blocks.reduce((sum, b) => sum + b.base, 0) / cluster.blocks.length;
        const pull = (block: (typeof blocks)[number]): number | null => {
          const xs: number[] = [];
          for (const id of block.ids) {
            const parents = (g.parentOf.get(id) ?? []).filter((q) => pos.has(q) && gen.get(q) === level - 1);
            if (!parents.length || parents.slice().sort().join("+") === cluster.key) continue;
            xs.push(parents.reduce((sum, q) => sum + pos.get(q)!, 0) / parents.length);
          }
          return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
        };
        const lefts: { b: (typeof blocks)[number]; x: number }[] = [];
        const rights: { b: (typeof blocks)[number]; x: number }[] = [];
        const middle: (typeof blocks)[number][] = [];
        for (const block of cluster.blocks) {
          const x = pull(block);
          if (x !== null && x - centre > 2 * gap) rights.push({ b: block, x });
          else if (x !== null && centre - x > 2 * gap) lefts.push({ b: block, x });
          else middle.push(block);
        }
        if (lefts.length || rights.length) {
          lefts.sort((a, b) => a.x - b.x);
          rights.sort((a, b) => a.x - b.x);
          cluster.blocks = [...lefts.map((i) => i.b), ...middle, ...rights.map((i) => i.b)];
        }
      }
      let cursor = 0;
      const diffs: number[] = [];
      for (const block of cluster.blocks) {
        cluster.locals.push(cursor);
        block.ids.forEach((id, i) => {
          const w = wish(id);
          if (w !== null) diffs.push(w - (cursor + block.rel[i]!));
        });
        cursor += (block.rel[block.rel.length - 1] ?? 0) + gap;
      }
      cluster.width = cursor - gap;
      for (const x of pullers.get(cluster.key) ?? []) for (let k = 0; k < ATTRACT; k++) diffs.push(x - cluster.width / 2);
      const move = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : null;
      cluster.shift = move ?? cluster.blocks[0]!.base;
    }
    list.sort((a, b) => a.shift + a.width / 2 - (b.shift + b.width / 2));
    const left: number[] = [];
    let edge = Number.NEGATIVE_INFINITY;
    for (const cluster of list) {
      const at = Math.max(cluster.shift, edge);
      left.push(at);
      edge = at + cluster.width + sep;
    }
    const right: number[] = new Array(list.length).fill(0);
    edge = Number.POSITIVE_INFINITY;
    for (let i = list.length - 1; i >= 0; i--) {
      const at = Math.min(list[i]!.shift, edge - list[i]!.width - sep + 0);
      right[i] = at;
      edge = at;
    }
    list.forEach((cluster, i) => {
      const at = (left[i]! + right[i]!) / 2;
      cluster.blocks.forEach((block, b) => {
        block.ids.forEach((id, k) => pos.set(id, at + cluster.locals[b]! + block.rel[k]!));
      });
    });
  };
  if (!tidy && people.length > 3) {
    const rounds = Math.max(4, Math.min(20, Math.round(25000 / Math.max(1, people.length))));
    for (let round = 0; round < rounds; round++) {
      for (let i = 1; i < levels.length; i++) refineLevel(levels[i]!);
      for (let i = levels.length - 2; i >= 0; i--) refineLevel(levels[i]!);
    }
    // Последние проходы сверху вниз: ребёнок встаёт под родителями, где ряд это позволяет.
    for (let round = 0; round < (PARENTS_FIRST || people.length <= PARENTS_FIRST_MAX ? 4 : 0); round++) for (let i = 1; i < levels.length; i++) refineLevel(levels[i]!, true);
    if (STRAIGHT_SPINE) for (const level of levels) alignSpine(level);
  }

  const span = (levels[levels.length - 1] ?? 0) - (levels[0] ?? 0);
  const rowOf = (level: number) => {
    const step = level - (levels[0] ?? 0);
    return flow === "up" ? span - step : step;
  };
  const nodes = people.map((p) => ({
    id: p.id,
    x: pos.get(p.id) ?? 0,
    y: PAD_Y + PORTRAIT_R + rowOf(gen.get(p.id) ?? 0) * ROW_H,
    gen: gen.get(p.id) ?? 0,
  }));
  const at = new Map(nodes.map((n) => [n.id, n]));
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = 0;
  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x);
    maxY = Math.max(maxY, node.y);
  }
  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(maxX)) maxX = 0;
  const shift = PAD_X - minX;
  for (const node of nodes) node.x += shift;

  const spouses: SpouseLink[] = [];
  for (const union of unions) {
    if (union.partnerIds.length < 2) continue;
    const a = at.get(union.partnerIds[0]!);
    const b = at.get(union.partnerIds[1]!);
    if (!a || !b) continue;
    const left = a.x <= b.x ? a : b;
    const right = a.x <= b.x ? b : a;
    spouses.push({
      unionId: union.id,
      x1: left.x,
      y1: left.y,
      x2: right.x,
      y2: right.y,
      status: union.status,
      curved: Math.abs(left.y - right.y) > 8 || right.x - left.x > SPOUSE_DX * 1.2,
    });
  }

  const buses: ChildBus[] = [];
  const hiddenLinks = new Set<string>();
  const pedigreeMode = people.length <= PEDIGREE_MAX;
  const FAR_DROP = 5 * (PLATE_W + H_GAP);
  for (const union of unions) {
    const parents = union.partnerIds.map((id) => at.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
    const parentMid = parents.length ? parents.reduce((sum, n) => sum + n.x, 0) / parents.length : null;
    const kids = union.childIds
      .map((id) => at.get(id))
      .filter((n): n is NonNullable<typeof n> => {
        if (!n) return false;
        // Супруг из другой семьи, его родители далеко: линию не тянем через схему, у карточки значок. Остальные дети всегда соединены с родителями.
        const reach = Math.max(FAR_DROP, (union.childIds.length * (PLATE_W + H_GAP)) / 2 + 3 * (PLATE_W + H_GAP));
        if (!pedigreeMode && detached.has(n.id) && parentMid !== null && Math.abs(n.x - parentMid) > reach) {
          hiddenLinks.add(n.id);
          return false;
        }
        return true;
      });
    if (!kids.length) continue;
    const xs = kids.map((n) => n.x).sort((a, b) => a - b);
    if (flow === "up") {
      const parentY = parents.length ? Math.min(...parents.map((n) => n.y)) : kids[0]!.y + ROW_H;
      const fromY = parents.length ? parentY - PORTRAIT_R : null;
      const childEdge = Math.max(...kids.map((n) => n.y)) + PORTRAIT_R + PLATE_GAP + PLATE_H;
      buses.push({
        unionId: union.id,
        fromX: parents.length ? parents.reduce((s, n) => s + n.x, 0) / parents.length : null,
        fromY,
        busY: fromY == null ? childEdge : childEdge + (fromY - childEdge) * 0.45,
        xs,
        childTop: childEdge,
      });
      continue;
    }
    const parentY = parents.length ? Math.max(...parents.map((n) => n.y)) : kids[0]!.y - ROW_H;
    // Супруги далеко друг от друга (каждый под своими родителями): линии идут от обоих вниз к общей скобке, как в восходящей схеме.
    const apart = parents.length === 2 && Math.abs(parents[0]!.x - parents[1]!.x) > SPOUSE_DX * 1.2;
    buses.push({
      unionId: union.id,
      fromX: parents.length ? parents.reduce((s, n) => s + n.x, 0) / parents.length : null,
      // У пары линия детей начинается от самого брака (плашка «БРАК» посередине), а не от карточки отца или матери.
      fromY: apart ? null : parents.length ? (parents.length > 1 ? parentY : parentY + PORTRAIT_R) : null,
      // Далёкие супруги: сначала линия брака между ними (с плашкой), от её середины вниз линия детей и ниже разветвление к детям.
      busY: parentY + PORTRAIT_R + PLATE_GAP + PLATE_H + 34 + (apart ? 44 : 0),
      xs,
      childTop: Math.min(...kids.map((n) => n.y)) - PORTRAIT_R,
      ...(apart ? { partnerXs: parents.map((n) => n.x), partnerTop: parentY + PORTRAIT_R + PLATE_GAP + PLATE_H, bracketY: parentY + PORTRAIT_R + PLATE_GAP + PLATE_H + 34 } : {}),
    });
  }

  // Линии детей разных семей одного ряда не должны сливаться в одну сплошную полосу: если их размахи пересекаются, они идут на разной высоте.
  const LANE = 12;
  const rowOfBus = new Map<number, ChildBus[]>();
  for (const bus of buses) {
    const key = Math.round(bus.childTop);
    const list = rowOfBus.get(key) ?? [];
    list.push(bus);
    rowOfBus.set(key, list);
  }
  for (const list of rowOfBus.values()) {
    // Дальняя связь от родителей рисуется отдельно бледным пунктиром (TreeStage), она не занимает полосу.
    const span = (bus: ChildBus) => {
      const kidsLo = Math.min(...bus.xs, ...(bus.partnerXs ?? []));
      const kidsHi = Math.max(...bus.xs, ...(bus.partnerXs ?? []));
      const near = bus.fromX != null && bus.fromX >= kidsLo - 520 && bus.fromX <= kidsHi + 520;
      return { lo: near ? Math.min(bus.fromX!, kidsLo) : kidsLo, hi: near ? Math.max(bus.fromX!, kidsHi) : kidsHi };
    };
    const ordered = list.map((bus) => ({ bus, ...span(bus) })).sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    const laneEnd: number[] = [];
    for (const item of ordered) {
      let lane = laneEnd.findIndex((end) => end < item.lo - 24);
      if (lane < 0) {
        lane = laneEnd.length;
        laneEnd.push(item.hi);
      } else laneEnd[lane] = item.hi;
      const capped = lane % 6;
      const dy = capped * LANE * (flow === "up" ? -1 : 1);
      item.bus.busY += dy;
      if (item.bus.bracketY !== undefined) item.bus.bracketY += dy;
    }
  }

  for (const bus of buses) {
    if (!bus.partnerXs) continue;
    const link = spouses.find((x) => x.unionId === bus.unionId);
    if (link) link.bracketY = bus.bracketY ?? bus.busY;
  }

  const labels: GenLabel[] = levels.map((level) => {
    const row = nodes.filter((n) => n.gen === level);
    return { gen: level, y: row[0]?.y ?? PAD_Y, text: rowLabel(level - focusGen) };
  });

  return {
    nodes,
    spouses,
    buses,
    labels,
    detached: [...hiddenLinks],
    width: maxX - minX + PAD_X * 2,
    height: maxY + PORTRAIT_R + PLATE_GAP + PLATE_H + PAD_Y,
    focusGen,
  };
}

export function sliceByRadius(people: Person[], unions: Union[], focusId: string, radius: number | null): TreeData {
  if (radius == null) return { people, unions, focusId };
  const keep = new Set<string>([focusId]);
  const open = [focusId];
  const spouses = new Map<string, string[]>();
  const kin = new Map<string, string[]>();
  for (const union of unions) {
    for (const id of union.partnerIds) {
      const mates = spouses.get(id) ?? [];
      for (const other of union.partnerIds) if (other !== id) mates.push(other);
      spouses.set(id, mates);
      const rel = kin.get(id) ?? [];
      for (const child of union.childIds) rel.push(child);
      kin.set(id, rel);
    }
    for (const child of union.childIds) {
      const rel = kin.get(child) ?? [];
      for (const parent of union.partnerIds) rel.push(parent);
      kin.set(child, rel);
    }
  }
  const dist = new Map<string, number>([[focusId, 0]]);
  while (open.length) {
    const id = open.shift()!;
    const d = dist.get(id)!;
    if (d >= radius) continue;
    for (const next of kin.get(id) ?? []) {
      if (dist.has(next)) continue;
      dist.set(next, d + 1);
      open.push(next);
    }
  }
  for (const id of dist.keys()) keep.add(id);
  for (const id of [...keep]) for (const mate of spouses.get(id) ?? []) keep.add(mate);
  return {
    people: people.filter((p) => keep.has(p.id)),
    unions: unions.filter((u) => u.partnerIds.some((id) => keep.has(id)) || u.childIds.some((id) => keep.has(id))).map((u) => ({
      ...u,
      partnerIds: u.partnerIds.filter((id) => keep.has(id)),
      childIds: u.childIds.filter((id) => keep.has(id)),
    })),
    focusId,
  };
}
