// Этап 4.5: экспорт берёт ту же расстановку, что экран: family через buildLayout + ручные сдвиги, classic без изменений.
import assert from "node:assert/strict";
import test from "node:test";
import { exportLayout, schemeLayout } from "./scheme.ts";
import { buildLayout } from "./layout-engine.ts";
import { applyShifts, shiftsOf } from "./offsets.ts";
import { annaPeople, artificial, elizaveta, elizavetaTangled, small } from "./family-fixtures.ts";
import { treeFromPeople } from "./from-people.ts";
import type { Person, Union } from "./types.ts";

type Case = [string, Person[], Union[], string, string?];
function cases(): Case[] {
  const a = treeFromPeople(annaPeople());
  return [
    ["Анна", a.people, a.unions, "iaxlcs3v"],
    ["20", small().people, small().unions, "жена"],
    ["искусственная", artificial().people, artificial().unions, "жена"],
    ["Елизавета 1", elizaveta().people, elizaveta().unions, "сестра1"],
    ["Елизавета 2", elizavetaTangled().people, elizavetaTangled().unions, "сестра1"],
  ];
}

for (const flow of ["down", "up"] as const) {
  test(`экспорт family повторяет экран (flow ${flow}): те же карточки, шины, дуги, ссылки, подписи групп`, () => {
    for (const [name, people, unions, owner] of cases()) {
      const screen = applyShifts(buildLayout(people, unions, owner, flow, { engine: "family", ownerId: owner }), unions, shiftsOf(people));
      const ex = exportLayout({ people, unions, focusId: owner, engine: "family", ownerId: owner }, flow) as typeof screen;
      assert.deepEqual(ex.nodes, screen.nodes, `${name}: карточки`);
      assert.deepEqual(ex.buses, screen.buses, `${name}: шины`);
      assert.deepEqual(ex.spouses, screen.spouses, `${name}: дуги`);
      assert.deepEqual(ex.refs, screen.refs, `${name}: ссылки`);
      assert.deepEqual(ex.groups, screen.groups, `${name}: подписи`);
      assert.equal(ex.nodes.length, people.length, `${name}: никого не потеряли`);
      // focusId не влияет на расстановку экспорта
      const other = exportLayout({ people, unions, focusId: people[people.length - 1]!.id, engine: "family", ownerId: owner }, flow);
      assert.deepEqual(other.nodes, ex.nodes, `${name}: focusId`);
    }
  });
}

test("classic: экспорт без engine или с engine classic даёт прежнюю «Схему»", () => {
  for (const [name, people, unions, owner] of cases()) {
    const base = schemeLayout(people, unions, owner, "down");
    assert.deepEqual(exportLayout({ people, unions, focusId: owner }, "down"), base, name);
    assert.deepEqual(exportLayout({ people, unions, focusId: owner, engine: "classic" }, "down"), base, name);
  }
});

test("ручные настройки доходят до экспорта: treeDx, treeDy, treeSide, treeRank", () => {
  const [, people, unions, owner] = cases()[4]!;
  const before = exportLayout({ people, unions, focusId: owner, engine: "family", ownerId: owner }, "down");
  const moved = people.map((p) => (p.id === "сын1" ? { ...p, treeDx: 140, treeDy: 30 } : p));
  const after = exportLayout({ people: moved, unions, focusId: owner, engine: "family", ownerId: owner }, "down");
  const b = before.nodes.find((n) => n.id === "сын1")!, a = after.nodes.find((n) => n.id === "сын1")!;
  assert.equal(a.x - b.x, 140);
  assert.equal(a.y - b.y, 30);
  // порядок и сторона меняют расстановку так же, как на экране
  const sided = people.map((p) => (p.id === "брат2" ? { ...p, treeSide: "right" as const, treeRank: 5 } : p));
  const screen = applyShifts(buildLayout(sided, unions, owner, "down", { engine: "family", ownerId: owner }), unions, shiftsOf(sided));
  const ex = exportLayout({ people: sided, unions, focusId: owner, engine: "family", ownerId: owner }, "down");
  assert.deepEqual(ex.nodes, screen.nodes);
});

test("treeRank меняет порядок братьев и сестёр в экспорте так же, как на экране (Анна, союз u6)", () => {
  const [, people, unions, owner] = cases()[0]!;
  const run = (ppl: Person[]) => exportLayout({ people: ppl, unions, focusId: owner, engine: "family", ownerId: owner }, "down");
  const kids = unions.find((u) => u.id === "u6")!.childIds;
  const base = run(people);
  const orderOf = (L: typeof base) => kids.slice().sort((a, b) => L.nodes.find((n) => n.id === a)!.x - L.nodes.find((n) => n.id === b)!.x);
  const reversed = orderOf(base).reverse();
  const ranked = people.map((p) => (reversed.includes(p.id) ? { ...p, rank: reversed.indexOf(p.id) + 1 } : p));
  const after = run(ranked);
  assert.notDeepEqual(orderOf(after), orderOf(base), "порядок изменился");
  const screen = applyShifts(buildLayout(ranked, unions, owner, "down", { engine: "family", ownerId: owner }), unions, shiftsOf(ranked));
  assert.deepEqual(after.nodes, screen.nodes);
  assert.equal(after.nodes.length, people.length);
});
