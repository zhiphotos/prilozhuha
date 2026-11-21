// Цепочка родства между двумя людьми: только чтение связей, ничего не записывается и не меняет раскладку.
// Сначала ищется путь по связям «родитель, ребёнок»; путь через брак ищется только когда кровного пути нет.
// Если кратчайших путей несколько (общие родители, двоюродные через двух дедушек и бабушек), отмечаются все.
import type { Union } from "./types.ts";

export type KinshipPath = {
  kind: "blood" | "marriage" | "none";
  /** Люди, входящие в цепочку (включая выбранных). */
  people: Set<string>;
  /** Связи родитель, ребёнок внутри цепочки: какой скобке детей принадлежит ребёнок. */
  parentLinks: { unionId: string; childId: string; parentId: string }[];
  /** Союзы, у которых подсвечивается линия брака: путь идёт через брак или в цепочке оба партнёра. */
  marriages: Set<string>;
  /** Число связей в самой короткой цепочке. */
  steps: number;
  /** Одна из кратчайших цепочек по людям, для подписи. */
  chain: string[];
};

const NONE: KinshipPath = { kind: "none", people: new Set(), parentLinks: [], marriages: new Set(), steps: 0, chain: [] };

type Edge = { to: string; kind: "up" | "down" | "marry"; unionId: string };

function adjacency(unions: Union[], withMarriage: boolean): Map<string, Edge[]> {
  const adj = new Map<string, Edge[]>();
  const add = (from: string, edge: Edge) => (adj.get(from) ?? adj.set(from, []).get(from)!).push(edge);
  for (const u of unions) {
    for (const child of u.childIds) {
      for (const parent of u.partnerIds) {
        if (parent === child) continue;
        add(parent, { to: child, kind: "down", unionId: u.id });
        add(child, { to: parent, kind: "up", unionId: u.id });
      }
    }
    if (withMarriage && u.partnerIds.length === 2 && u.partnerIds[0] !== u.partnerIds[1]) {
      add(u.partnerIds[0]!, { to: u.partnerIds[1]!, kind: "marry", unionId: u.id });
      add(u.partnerIds[1]!, { to: u.partnerIds[0]!, kind: "marry", unionId: u.id });
    }
  }
  return adj;
}

// Состояние поиска: человек и фаза. Кровный путь идёт вверх к общему предку, затем только вниз (через ребёнка к другому его родителю родство не считается кровным).
type State = { id: string; down: boolean };
const key = (s: State) => `${s.id}|${s.down ? 1 : 0}`;

function bfs(starts: State[], next: (s: State) => { to: State; edge: Edge; from: State }[]): Map<string, number> {
  const dist = new Map<string, number>();
  const queue: State[] = [];
  for (const s of starts) { dist.set(key(s), 0); queue.push(s); }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    for (const m of next(cur)) if (!dist.has(key(m.to))) { dist.set(key(m.to), dist.get(key(cur))! + 1); queue.push(m.to); }
  }
  return dist;
}

function build(unions: Union[], a: string, b: string, withMarriage: boolean): KinshipPath | null {
  const adj = adjacency(unions, withMarriage);
  // Кровный поиск различает фазы; поиск через брак идёт по людям без ограничений (фаза всегда «вверх»).
  const forward = (s: State) =>
    (adj.get(s.id) ?? []).flatMap((edge) => {
      if (!withMarriage) {
        if (edge.kind === "up" && s.down) return [];
        return [{ from: s, edge, to: { id: edge.to, down: s.down || edge.kind === "down" } }];
      }
      return [{ from: s, edge, to: { id: edge.to, down: false } }];
    });
  // Обратные переходы для расстояния до цели: перебираем прямые переходы всех состояний.
  const all: State[] = [];
  for (const id of adj.keys()) { all.push({ id, down: false }); if (!withMarriage) all.push({ id, down: true }); }
  all.push({ id: a, down: false }, { id: b, down: false }, { id: b, down: true });
  const reverse = new Map<string, { from: State; to: State; edge: Edge }[]>();
  for (const s of all) for (const m of forward(s)) (reverse.get(key(m.to)) ?? reverse.set(key(m.to), []).get(key(m.to))!).push(m);
  const da = bfs([{ id: a, down: false }], forward);
  const ends = withMarriage ? [{ id: b, down: false }] : [{ id: b, down: false }, { id: b, down: true }];
  const total = Math.min(...ends.map((e) => da.get(key(e)) ?? Infinity));
  if (!Number.isFinite(total)) return null;
  const db = bfs(ends.filter((e) => da.get(key(e)) === total), (s) => (reverse.get(key(s)) ?? []).map((m) => ({ from: s, edge: m.edge, to: m.from })));
  const people = new Set<string>([a, b]);
  const parentLinks: KinshipPath["parentLinks"] = [];
  const marriages = new Set<string>();
  const seenLink = new Set<string>();
  for (const s of all) {
    const ds = da.get(key(s));
    if (ds === undefined) continue;
    for (const m of forward(s)) {
      const dt = db.get(key(m.to));
      if (dt === undefined || ds + 1 + dt !== total) continue;
      people.add(s.id);
      people.add(m.to.id);
      if (m.edge.kind === "marry") marriages.add(m.edge.unionId);
      else {
        const childId = m.edge.kind === "down" ? m.to.id : s.id;
        const parentId = m.edge.kind === "down" ? s.id : m.to.id;
        const k = `${m.edge.unionId}|${childId}|${parentId}`;
        if (!seenLink.has(k)) { seenLink.add(k); parentLinks.push({ unionId: m.edge.unionId, childId, parentId }); }
      }
    }
  }
  // Оба партнёра союза в цепочке (общие родители братьев, двоюродных): линия их брака тоже входит в картину.
  for (const u of unions) if (u.partnerIds.length === 2 && u.partnerIds.every((p) => people.has(p)) && parentLinks.some((l) => l.unionId === u.id)) marriages.add(u.id);
  // Одна из кратчайших цепочек для подписи.
  const chain = [a];
  let cur: State = { id: a, down: false };
  while (key(cur) !== key({ id: b, down: cur.down }) || chain.length === 1) {
    const step = forward(cur).find((m) => (da.get(key(cur)) ?? 0) + 1 + (db.get(key(m.to)) ?? Infinity) === total);
    if (!step) break;
    chain.push(step.to.id);
    cur = step.to;
    if (step.to.id === b) break;
  }
  return { kind: withMarriage ? "marriage" : "blood", people, parentLinks, marriages, steps: total, chain };
}

/** Цепочка между a и b. Кровная имеет приоритет; через брак ищется, только если кровного пути нет. */
export function findKinshipPath(unions: Union[], a: string, b: string): KinshipPath {
  if (!a || !b || a === b) return NONE;
  return build(unions, a, b, false) ?? build(unions, a, b, true) ?? NONE;
}
