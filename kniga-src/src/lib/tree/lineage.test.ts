// Подсветка линии родства (просьба Марии В.): выбрали человека, подсвечены линии к его родителям, братьям и сёстрам (общая скобка детей), к предкам выше и к потомкам ниже, брак.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { lineageUnionIds } from "./lineage.ts";
import { treeFromPeople } from "./from-people.ts";
import type { Union } from "./types.ts";

const u = (id: string, partnerIds: string[], childIds: string[]): Union => ({ id, partnerIds, childIds, status: "married", startYear: "", endYear: "" });
// дед+баба -> папа, дядя; папа+мама -> я, сестра; я+жена -> сын; дядя+тётя -> двоюродный
const unions = [u("gp", ["ded", "baba"], ["papa", "dyadya"]), u("par", ["papa", "mama"], ["ya", "sestra"]), u("me", ["ya", "zhena"], ["syn"]), u("unc", ["dyadya", "tetya"], ["cousin"]), u("mamas", ["mamad", "mamab"], ["mama"])];

test("у выбранного подсвечены: скобка родителей (с братьями и сёстрами), предки выше, брак и потомки", () => {
  const set = lineageUnionIds(unions, "ya");
  assert.deepEqual([...set].sort(), ["gp", "mamas", "me", "par"]);
});
test("у двоюродного подсвечена линия вверх до общих предков, чужие ветки не подсвечиваются", () => {
  const set = lineageUnionIds(unions, "cousin");
  assert.deepEqual([...set].sort(), ["gp", "unc"]);
});
test("у человека без связей и у неизвестного id подсвечивать нечего", () => {
  assert.equal(lineageUnionIds(unions, "stranger").size, 0);
  assert.equal(lineageUnionIds([], "ya").size, 0);
});
test("циклы в данных не зависают", () => {
  const loop = [u("a", ["x"], ["y"]), u("b", ["y"], ["x"])];
  assert.ok(lineageUnionIds(loop, "x").size <= 2);
});

test("на реальной структуре тестировщика: у каждого человека подсвеченные линии включают его родительскую скобку и его браки", () => {
  const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/diag-1101-anon.json", import.meta.url)), "utf8")) as { people: Parameters<typeof treeFromPeople>[0] };
  const tree = treeFromPeople(fixture.people);
  for (const p of tree.people) {
    const set = lineageUnionIds(tree.unions, p.id);
    for (const un of tree.unions) {
      if (un.childIds.includes(p.id) || un.partnerIds.includes(p.id)) assert.ok(set.has(un.id), `${p.id}: ${un.id}`);
    }
  }
});
