// Синтетические деревья для проверки крыльев семейной раскладки: центральная пара W и H, предки обеих сторон,
// вторые браки предков с детьми, сводные братья и сёстры, семьи у детей. Только выдуманные номера, настоящих имён нет.
import { treeFromPeople } from "./from-people.ts";
import type { Person as RodPerson } from "../rod/types.ts";

export type P = Record<string, any>;
export const mk = (id: string, g: "m" | "f", extra: P = {}): P => ({ id, name: id, firstName: id, lastName: "", relation: "", birthYear: "", maidenName: "", notes: "", gender: g, fromFile: true, ...extra });

/** Повторяемый «случайный» ряд (чтобы одни и те же деревья получались на любой машине). */
export function lcg(start: number) {
  let seed = start;
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function side(pre: string, root: string, depth: number, p2: number, rnd: () => number): P[] {
  const out: P[] = [];
  let n = 0;
  const id = (s: string) => `${pre}${s}${++n}`;
  const rootP = mk(root, root === "W" ? "f" : "m");
  out.push(rootP);
  const build = (child: P, d: number) => {
    if (d === 0) return;
    const f = mk(id("F"), "m"), m = mk(id("M"), "f");
    f.spouse = m.id;
    m.spouse = f.id;
    out.push(f, m);
    child.parents = [f.id, m.id];
    if (rnd() < 0.6) out.push(mk(id("s"), rnd() < 0.5 ? "m" : "f", { parents: [f.id, m.id] }));
    if (rnd() < p2) {
      const who = rnd() < 0.5 ? f : m;
      const x = mk(id("X"), who === f ? "f" : "m", { spouse: who.id });
      who.moreSpouses = [x.id];
      out.push(x);
      const k = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < k; i++) {
        const half = mk(id("h"), rnd() < 0.5 ? "m" : "f", { parents: who === f ? [f.id, x.id] : [x.id, m.id] });
        out.push(half);
        if (rnd() < 0.5) {
          const hs = mk(id("hs"), half.gender === "m" ? "f" : "m", { spouse: half.id });
          half.spouse = hs.id;
          out.push(hs, mk(id("hk"), "m", { parents: half.gender === "m" ? [half.id, hs.id] : [hs.id, half.id] }));
        }
      }
    }
    build(f, d - 1);
    build(m, d - 1);
  };
  build(rootP, depth);
  return out;
}

/** Мир номер `s`: у каждой стороны предки на `depth` поколений, доля вторых браков `p2`. */
export function randomWorld(s: number, depth = 4, p2 = 0.5): P[] {
  const rnd = lcg(s * 7919 + 13);
  const all = [...side("w", "W", depth, p2, rnd), ...side("h", "H", depth, p2, rnd)];
  all.find((p) => p.id === "W")!.spouse = "H";
  all.find((p) => p.id === "H")!.spouse = "W";
  all.push(mk("c1", "m", { parents: ["W", "H"] }));
  return all;
}

/** Большое дерево (около `target` человек) для замера времени. */
export function bigWorld(target: number, rnd = lcg(3)): P[] {
  const out: P[] = [];
  let n = 0;
  const id = (s: string) => `${s}${++n}`;
  const pairUp = (child: P, d: number, tag: string) => {
    if (d === 0 || out.length > target) return;
    const f = mk(id(`${tag}F`), "m"), m = mk(id(`${tag}M`), "f");
    f.spouse = m.id;
    m.spouse = f.id;
    out.push(f, m);
    child.parents = [f.id, m.id];
    const kids = 1 + Math.floor(rnd() * 3);
    for (let i = 0; i < kids; i++) {
      const c = mk(id(`${tag}c`), rnd() < 0.5 ? "m" : "f", { parents: [f.id, m.id] });
      out.push(c);
      if (rnd() < 0.5) {
        const sp = mk(id(`${tag}cs`), c.gender === "m" ? "f" : "m", { spouse: c.id });
        c.spouse = sp.id;
        out.push(sp);
        for (let j = 0; j < 2; j++) out.push(mk(id(`${tag}g`), "m", { parents: c.gender === "m" ? [c.id, sp.id] : [sp.id, c.id] }));
      }
    }
    if (rnd() < 0.5) {
      const who = rnd() < 0.5 ? f : m;
      const x = mk(id(`${tag}X`), who === f ? "f" : "m", { spouse: who.id });
      who.moreSpouses = [x.id];
      out.push(x);
      for (let i = 0; i < 2; i++) out.push(mk(id(`${tag}h`), "m", { parents: who === f ? [f.id, x.id] : [x.id, m.id] }));
    }
    pairUp(f, d - 1, tag);
    pairUp(m, d - 1, tag);
  };
  const W = mk("W", "f"), H = mk("H", "m");
  W.spouse = "H";
  H.spouse = "W";
  out.push(W, H);
  pairUp(W, 12, "w");
  pairUp(H, 12, "h");
  return out;
}

export const treeOf = (people: P[]) => treeFromPeople(people as unknown as RodPerson[]);

/**
 * Независимая от раскладки проверка: чья родня человек. Обход по родительским и брачным связям от W без прохода через H
 * и наоборот; потомки пары нейтральны. Кого достали с обеих сторон, тот «спорный» и в проверку не входит.
 */
export function sideTags(people: P[]): Map<string, "W" | "H"> {
  const neutral = new Set<string>();
  const kidsOf = new Map<string, string[]>();
  for (const p of people) for (const q of p.parents ?? []) (kidsOf.get(q) ?? kidsOf.set(q, []).get(q)!).push(p.id);
  const stack = people.filter((p) => (p.parents ?? []).includes("W") && (p.parents ?? []).includes("H")).map((p) => p.id);
  while (stack.length) {
    const c = stack.pop()!;
    if (neutral.has(c)) continue;
    neutral.add(c);
    for (const k of kidsOf.get(c) ?? []) stack.push(k);
  }
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (neutral.has(a) || neutral.has(b)) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const p of people) {
    for (const q of p.parents ?? []) add(p.id, q);
    if (p.spouse) add(p.id, p.spouse);
    for (const s of p.moreSpouses ?? []) add(p.id, s);
  }
  const reach = (start: string, block: string) => {
    const seen = new Set([start]);
    for (const q = [start]; q.length; ) for (const o of adj.get(q.shift()!) ?? []) if (o !== block && !seen.has(o)) { seen.add(o); q.push(o); }
    return seen;
  };
  const fromW = reach("W", "H"), fromH = reach("H", "W");
  const res = new Map<string, "W" | "H">();
  for (const id of fromW) if (!fromH.has(id)) res.set(id, "W");
  for (const id of fromH) if (!fromW.has(id)) res.set(id, "H");
  return res;
}

/** Сколько пар «человек жены правее человека мужа в одном ряду». Ноль: стороны в рядах не перемешаны. */
export function rowMixing(nodes: { id: string; x: number; gen: number }[], people: P[]): number {
  const tag = sideTags(people);
  let n = 0;
  for (const a of nodes) for (const b of nodes) if (a.gen === b.gen && tag.get(a.id) === "W" && tag.get(b.id) === "H" && a.x > b.x) n++;
  return n;
}
