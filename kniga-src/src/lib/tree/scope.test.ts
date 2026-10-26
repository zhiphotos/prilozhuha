import assert from "node:assert/strict";
import test from "node:test";
import { scopeFilter } from "./scope.ts";
import type { Person, Union } from "./types.ts";

const p = (id: string): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender: "u", birthYear: "", deathYear: "", photo: "", note: "" });
const u = (id: string, partnerIds: string[], childIds: string[]): Union => ({ id, partnerIds, childIds, status: "married", startYear: "", endYear: "" });

// me, сестра, её муж; родители; дедушка с бабушкой, их второй ребёнок (дядя) и его жена; жена me (spouse) с её мамой; ребёнок.
const people = ["me", "sis", "sisHusb", "mom", "dad", "gm", "gf", "uncle", "uncleWife", "wife", "wifeMom", "kid"].map(p);
const unions = [
  u("u1", ["mom", "dad"], ["me", "sis"]),
  u("u2", ["gf", "gm"], ["mom", "uncle"]),
  u("u3", ["sis", "sisHusb"], []),
  u("u4", ["uncle", "uncleWife"], []),
  u("u5", ["me", "wife"], ["kid"]),
  u("u6", ["wifeMom"], ["wife"]),
];
const ids = (scope: Parameters<typeof scopeFilter>[3]) => scopeFilter(people, unions, "me", scope).people.map((x) => x.id).sort();

test("прямые предки и потомки: без сестры, дяди и родни жены", () => {
  assert.deepEqual(ids("direct"), ["dad", "gf", "gm", "kid", "me", "mom", "wife"]);
});
test("плюс братья и сёстры корня", () => {
  assert.deepEqual(ids("direct-sib-root"), ["dad", "gf", "gm", "kid", "me", "mom", "sis", "wife"]);
});
test("плюс братья и сёстры всех прямых", () => {
  assert.deepEqual(ids("direct-sib-all"), ["dad", "gf", "gm", "kid", "me", "mom", "sis", "uncle", "wife"]);
});
test("кровные: без родни по браку", () => {
  assert.deepEqual(ids("blood"), ["dad", "gf", "gm", "kid", "me", "mom", "sis", "uncle"]);
});
test("все: ничего не скрыто", () => {
  assert.equal(ids("all").length, people.length);
});
