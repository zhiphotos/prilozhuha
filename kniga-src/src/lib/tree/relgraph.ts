import type { TreeData } from "./types.ts";

/**
 * Граф родства: единственный источник истины о том, кто чей родитель и кто с кем в паре.
 * Раскладка и отрисовка только читают его, связей не назначают.
 */
export type ParentKind = "biological" | "adoptive" | "step" | "unknown";
export type ParentChild = { parentId: string; childId: string; type: ParentKind; status: "confirmed" | "suggested" };
export type Partnership = { id: string; a: string; b: string; status: string; start: string; end: string };
export type RelationshipGraph = {
  ids: Set<string>;
  parents: Map<string, ParentChild[]>;
  children: Map<string, ParentChild[]>;
  partnerships: Partnership[];
  ghosts: Set<string>;
};

/** Заглушки «Мама»/«Папа» существуют только в отображении (id с префиксом __). */
const isGhost = (id: string) => id.startsWith("__") && id !== "__self";

export function buildRelationshipGraph(data: Pick<TreeData, "people" | "unions">): RelationshipGraph {
  const ids = new Set(data.people.map((p) => p.id));
  const parents = new Map<string, ParentChild[]>();
  const children = new Map<string, ParentChild[]>();
  const seen = new Set<string>();
  const partnerships: Partnership[] = [];
  const pseen = new Set<string>();
  for (const u of data.unions) {
    const ps = [...new Set(u.partnerIds)].filter((id) => ids.has(id));
    for (const child of u.childIds) {
      if (!ids.has(child)) continue;
      for (const parent of ps) {
        const key = `${parent}>${child}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const rel: ParentChild = { parentId: parent, childId: child, type: "biological", status: "confirmed" };
        parents.set(child, [...(parents.get(child) ?? []), rel]);
        children.set(parent, [...(children.get(parent) ?? []), rel]);
      }
    }
    if (ps.length >= 2) {
      const key = [...ps].sort().join("|");
      if (!pseen.has(key)) {
        pseen.add(key);
        partnerships.push({ id: u.id, a: ps[0]!, b: ps[1]!, status: u.status, start: u.startYear, end: u.endYear });
      }
    }
  }
  return { ids, parents, children, partnerships, ghosts: new Set([...ids].filter(isGhost)) };
}

export const parentIdsOf = (g: RelationshipGraph, id: string) => (g.parents.get(id) ?? []).map((r) => r.parentId);
export const childIdsOf = (g: RelationshipGraph, id: string) => (g.children.get(id) ?? []).map((r) => r.childId);

export type Issue = { code: "self-parent" | "cycle" | "too-many-parents" | "generation-conflict" | "unknown-id"; ids: string[]; message: string };

/** Проверка связей. Ничего не исправляет молча, только сообщает. */
export function validateGraph(g: RelationshipGraph, rootId?: string): Issue[] {
  const out: Issue[] = [];
  for (const [child, list] of g.parents) {
    if (list.some((r) => r.parentId === child)) out.push({ code: "self-parent", ids: [child], message: "Человек записан родителем самому себе." });
    if (list.length > 2) out.push({ code: "too-many-parents", ids: [child, ...list.map((r) => r.parentId)], message: "У человека больше двух родителей: выберите двух." });
  }
  // Циклы по родительским связям.
  const state = new Map<string, 1 | 2>();
  const reported = new Set<string>();
  const visit = (id: string, path: string[]) => {
    state.set(id, 1);
    for (const p of parentIdsOf(g, id)) {
      if (p === id) continue;
      const st = state.get(p);
      if (st === 1) {
        const loop = [...path.slice(path.indexOf(p)), id].sort().join("|");
        if (!reported.has(loop)) {
          reported.add(loop);
          out.push({ code: "cycle", ids: [...path.slice(path.indexOf(p)), id], message: "Круг в родстве: человек оказывается собственным предком." });
        }
      } else if (!st) visit(p, [...path, id]);
    }
    state.set(id, 2);
  };
  for (const id of g.ids) if (!state.has(id)) visit(id, []);
  if (rootId && !out.some((i) => i.code === "cycle")) {
    const r = calculateGenerations(rootId, g);
    for (const c of r.conflicts) out.push({ code: "generation-conflict", ids: [c], message: "Связи ставят человека в несовместимые поколения." });
  }
  return out;
}

export type Sibling = { id: string; kind: "full" | "half"; shared: string[] };

/** Братья и сёстры считаются динамически: оба родителя совпали = родные, один = неполнородные. */
export function findSiblings(personId: string, g: RelationshipGraph): Sibling[] {
  const mine = parentIdsOf(g, personId);
  if (!mine.length) return [];
  const out = new Map<string, Set<string>>();
  for (const p of mine) {
    for (const c of childIdsOf(g, p)) {
      if (c === personId) continue;
      if (!out.has(c)) out.set(c, new Set());
      out.get(c)!.add(p);
    }
  }
  return [...out].map(([id, shared]) => {
    const theirs = parentIdsOf(g, id);
    const full = mine.length >= 2 && theirs.length === mine.length && mine.every((p) => shared.has(p));
    return { id, kind: full ? ("full" as const) : ("half" as const), shared: [...shared].sort() };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

/** Поколения только по родительским связям: центр 0, родитель −1, ребёнок +1. Партнёрство поколение не меняет. */
export function calculateGenerations(rootId: string, g: RelationshipGraph): { gen: Map<string, number>; conflicts: string[] } {
  const gen = new Map<string, number>([[rootId, 0]]);
  const conflicts = new Set<string>();
  const queue = [rootId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const base = gen.get(id)!;
    const edges: [string, number][] = [...parentIdsOf(g, id).map((p): [string, number] => [p, base - 1]), ...childIdsOf(g, id).map((c): [string, number] => [c, base + 1])];
    for (const [other, level] of edges) {
      const have = gen.get(other);
      if (have === undefined) { gen.set(other, level); queue.push(other); }
      else if (have !== level) conflicts.add(other);
    }
  }
  return { gen, conflicts: [...conflicts].sort() };
}

export type Branch = "self" | "mother" | "father" | "spouse" | "descendant" | "other";

/** Сторона по пути родства от центра: прямые предки и их потомки идут через маму или папу центра, родня супруга отдельно. */
export function resolveBranch(personId: string, rootId: string, g: RelationshipGraph, genderOf: (id: string) => "m" | "f" | "u"): Branch {
  if (personId === rootId) return "self";
  const up = (from: string): Set<string> => {
    const seen = new Set<string>();
    const q = [from];
    for (let i = 0; i < q.length; i++) for (const p of parentIdsOf(g, q[i]!)) if (!seen.has(p)) { seen.add(p); q.push(p); }
    return seen;
  };
  const down = (from: string): Set<string> => {
    const seen = new Set<string>();
    const q = [from];
    for (let i = 0; i < q.length; i++) for (const c of childIdsOf(g, q[i]!)) if (!seen.has(c)) { seen.add(c); q.push(c); }
    return seen;
  };
  if (down(rootId).has(personId)) return "descendant";
  const rootParents = parentIdsOf(g, rootId);
  const sideOf = (parent: string): Branch => (genderOf(parent) === "f" ? "mother" : genderOf(parent) === "m" ? "father" : "other");
  for (const parent of rootParents) {
    if (parent === personId || up(parent).has(personId) || down(parent).has(personId)) return sideOf(parent);
  }
  // Через общего предка выше: идём к тому родителю, под которым стоит ветка.
  for (const parent of rootParents) for (const anc of up(parent)) if (down(anc).has(personId)) return sideOf(parent);
  const mates = g.partnerships.flatMap((p) => (p.a === rootId ? [p.b] : p.b === rootId ? [p.a] : []));
  for (const m of mates) if (m === personId || up(m).has(personId) || down(m).has(personId) || down(personId).has(m)) return "spouse";
  return "other";
}

/** Проверка исходных записей «Люди» (до сборки древа): ловит то, что сборка тихо отбрасывает. Данные не меняет. */
export function validatePeopleLinks(people: { id: string; name: string; parents?: string[]; spouse?: string }[]): string[] {
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const out: string[] = [];
  for (const p of people) {
    const par = p.parents ?? [];
    if (par.includes(p.id)) out.push(`«${p.name}» записан(а) родителем самому себе: откройте карточку, поле «Чей ребёнок».`);
    for (const id of par) if (id !== p.id && (p.spouse === id || people.find((q) => q.id === id)?.spouse === p.id)) out.push(`«${p.name}»: родитель «${name(id)}» одновременно записан(а) супругом, проверьте поле «Чей ребёнок».`);
  }
  return out;
}
