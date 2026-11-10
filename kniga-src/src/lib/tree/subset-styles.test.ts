import assert from "node:assert/strict";
import test from "node:test";
import { layoutBoheme } from "./boheme.ts";
import { layoutCameo } from "./cameo.ts";
import { demoTree } from "./demo.ts";
import { layoutGzhel } from "./gzhel.ts";
import { layoutTree } from "./layout.ts";
import { layoutPoster } from "./poster.ts";
import { addRelatives, groups, pickSubset } from "./subset.ts";
import { layoutTaiga } from "./taiga.ts";

type Node = { id: string; x: number; y: number };
const t = demoTree();
const pick = (reach: ("ancestors" | "descendants" | "spouses" | "siblings")[], from: string) => {
  let ids = new Set([from]);
  for (const r of reach) ids = addRelatives(t.unions, ids, r);
  return { ids, ...pickSubset(t.people, t.unions, ids) };
};
// Самый «глубокий» человек демо-древа и ещё два набора: только предки и семья с потомками.
const deepest = [...t.people].map((p) => ({ id: p.id, n: addRelatives(t.unions, new Set([p.id]), "ancestors").size })).sort((a, b) => b.n - a.n)[0]!.id;
const sets = [
  { name: "предки, супруги, братья", ...pick(["ancestors", "spouses", "siblings"], deepest) },
  { name: "только предки", ...pick(["ancestors"], deepest) },
  { name: "корень с потомками и супругами", ...(() => { const root = [...t.people].sort((a, b) => (a.birthYear || "9").localeCompare(b.birthYear || "9"))[0]!.id; return pick(["descendants", "spouses"], root); })() },
];

const layouts: { name: string; run: (flow: "down" | "up", s: (typeof sets)[number], focus: string) => Node[] }[] = [
  { name: "рабочий", run: (f, s, c) => layoutTree(s.people, s.unions, c, f).nodes },
  { name: "живое древо", run: (f, s, c) => layoutPoster(s.people, s.unions, c, f).nodes },
  { name: "Камея", run: (f, s, c) => layoutCameo(s.people, s.unions, c, f).nodes },
  { name: "Гжель", run: (f, s, c) => layoutGzhel(s.people, s.unions, c, f).nodes },
  { name: "Богема", run: (f, s, c) => layoutBoheme(s.people, s.unions, c, f).nodes },
  { name: "Тайга", run: (f, s, c) => layoutTaiga(s.people, s.unions, c, f).nodes },
];

for (const set of sets) {
  for (const lay of layouts) {
    for (const flow of ["down", "up"] as const) {
      test(`${lay.name}, ${flow}, «${set.name}»: все выбранные на схеме, дети ниже родителей`, () => {
        const focus = set.ids.has(deepest) ? deepest : set.people[0]!.id;
        const nodes = lay.run(flow, set, focus);
        const at = new Map(nodes.map((n) => [n.id, n]));
        for (const p of set.people) assert.ok(at.has(p.id), `нет на схеме: ${p.firstName}`);
        assert.equal(groups(set.people, set.unions, set.ids).length, 1, "набор связный");
        for (const u of set.unions) {
          for (const c of u.childIds) {
            for (const parent of u.partnerIds) {
              const a = at.get(parent);
              const b = at.get(c);
              if (!a || !b) continue;
              // Живое древо рисуется иначе (ствол и крона): порядок по вертикали там не поколения.
              if (lay.name === "живое древо") continue;
              assert.ok(flow === "down" ? b.y > a.y : b.y < a.y, `${lay.name}: ребёнок не по ту сторону родителя`);
            }
          }
        }
      });
    }
  }
}
