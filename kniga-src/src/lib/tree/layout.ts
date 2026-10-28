import { yearNum } from "./kinship.ts";
import { H_GAP, PAD_X, PAD_Y, PLATE_GAP, PLATE_H, PLATE_W, PORTRAIT_R, ROOT_GAP, ROW_H, SPOUSE_DX } from "./metrics.ts";
import type { ChildBus, GenLabel, Person, SpouseLink, TreeData, TreeLayout, Union } from "./types.ts";

/** Насколько разводить ветки друг от друга: 0 плотно, 1 шире, 2 ещё шире. Выбирает пользователь. */
let spread: 0 | 1 | 2 = 0;
const STRAIGHT_SPINE = false;
/** Проверено замером на её GED: оба приёма не улучшают, а ухудшают раскладку (длиннее линии, нарушается порядок по возрасту). Оставлены выключенными. */
const PULL_EDGE = false;
const PARENTS_FIRST = false;
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
  const hub = ids.slice().sort((a, b) => (g.marriagesOf.get(b)?.length ?? 0) - (g.marriagesOf.get(a)?.length ?? 0) || byBirth(g, a, b))[0]!;
  const others = ids.filter((id) => id !== hub).sort((a, b) => marriageYear(g, hub, a) - marriageYear(g, hub, b) || byBirth(g, a, b));
  if (others.length === 2) return [others[0]!, hub, others[1]!];
  const mid = Math.ceil(others.length / 2);
  return [...others.slice(0, mid), hub, ...others.slice(mid)];
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

function rowLabel(delta: number): string {
  if (delta === 0) return "Вы и ваши";
  const n = Math.abs(delta);
  if (delta < 0) return n === 1 ? "Родители" : n === 2 ? "Деды" : `${n} колено вверх`;
  return n === 1 ? "Дети" : n === 2 ? "Внуки" : `${n} колено вниз`;
}

export function layoutTree(people: Person[], unions: Union[], focusId: string, flow: "down" | "up" = "down"): TreeLayout {
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

  levels.forEach((level, index) => {
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
  if (people.length > 3) {
    const rounds = Math.max(4, Math.min(20, Math.round(25000 / Math.max(1, people.length))));
    for (let round = 0; round < rounds; round++) {
      for (let i = 1; i < levels.length; i++) refineLevel(levels[i]!);
      for (let i = levels.length - 2; i >= 0; i--) refineLevel(levels[i]!);
    }
    // Последние проходы сверху вниз: ребёнок встаёт под родителями, где ряд это позволяет.
    for (let round = 0; round < (PARENTS_FIRST ? 4 : 0); round++) for (let i = 1; i < levels.length; i++) refineLevel(levels[i]!, true);
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
  for (const union of unions) {
    const kids = union.childIds.map((id) => at.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
    if (!kids.length) continue;
    const parents = union.partnerIds.map((id) => at.get(id)).filter((n): n is NonNullable<typeof n> => Boolean(n));
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
    buses.push({
      unionId: union.id,
      fromX: parents.length ? parents.reduce((s, n) => s + n.x, 0) / parents.length : null,
      fromY: parents.length ? parentY + PORTRAIT_R : null,
      busY: parentY + PORTRAIT_R + 48,
      xs,
      childTop: Math.min(...kids.map((n) => n.y)) - PORTRAIT_R,
    });
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
