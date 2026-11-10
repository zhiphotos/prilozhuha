import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseGedcom } from "./importTree.ts";
import { layoutTree } from "./layout.ts";
import { addRelatives, groups, pickSubset } from "./subset.ts";

const tree = () => {
  const r = parseGedcom(readFileSync(new URL("./fixtures/ged-family-v2.ged", import.meta.url), "utf8"));
  if ("error" in r) throw new Error(r.error);
  return r.tree;
};

test("вырезка оставляет только выбранных и связи между ними", () => {
  const t = tree();
  const child = t.unions.find((u) => u.partnerIds.length === 2 && u.childIds.length > 0)!;
  const ids = new Set([...child.partnerIds, child.childIds[0]!]);
  const s = pickSubset(t.people, t.unions, ids);
  assert.equal(s.people.length, 3);
  assert.ok(s.unions.some((u) => u.partnerIds.length === 2 && u.childIds.length === 1));
  for (const u of s.unions) for (const id of [...u.partnerIds, ...u.childIds]) assert.ok(ids.has(id));
});

test("предки и потомки добавляются цепочкой", () => {
  const t = tree();
  const some = t.people[t.people.length - 1]!.id;
  const up = addRelatives(t.unions, new Set([some]), "ancestors");
  assert.ok(up.size >= 1 && up.has(some));
  const root = [...up].find((id) => !t.unions.some((u) => u.childIds.includes(id)));
  assert.ok(root);
  const down = addRelatives(t.unions, new Set([root!]), "descendants");
  assert.ok(down.has(some));
});

test("связные группы: пара и чужой человек дают две группы", () => {
  const t = tree();
  const u = t.unions.find((x) => x.partnerIds.length === 2)!;
  const stranger = t.people.find((p) => !u.partnerIds.includes(p.id) && !u.childIds.includes(p.id) && !t.unions.some((x) => x.partnerIds.includes(p.id) && x.partnerIds.some((q) => u.partnerIds.includes(q))))!;
  const g = groups(t.people, t.unions, new Set([...u.partnerIds, stranger.id]));
  assert.equal(g.length, 2);
});

test("раскладка не теряет выбранных, даже если они не связаны", () => {
  const t = tree();
  const u = t.unions.find((x) => x.partnerIds.length === 2)!;
  const other = t.people.filter((p) => !u.partnerIds.includes(p.id) && !u.childIds.includes(p.id)).slice(0, 2);
  const ids = new Set([...u.partnerIds, ...other.map((p) => p.id)]);
  const s = pickSubset(t.people, t.unions, ids);
  const lay = layoutTree(s.people, s.unions, u.partnerIds[0]!, "down");
  const placed = new Set(lay.nodes.map((n) => n.id));
  assert.equal([...ids].filter((id) => placed.has(id)).length, ids.size);
});
