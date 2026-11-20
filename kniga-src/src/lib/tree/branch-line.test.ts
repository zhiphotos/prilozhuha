// Окраска только линии родства: человек и его предки, без потомков, братьев, сестёр и супругов. Данные вымышленные.
import assert from "node:assert/strict";
import test from "node:test";
import { ancestryOf, branchColorOf, clearLineColors, getBranchColors, setBranchColor, setLineColor } from "./branch-colors.ts";
import type { Person, Union } from "./types.ts";

const P = (id: string): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender: "u", birthYear: "", deathYear: "", photo: "", note: "" });
const U = (id: string, partnerIds: string[], childIds: string[]): Union => ({ id, partnerIds, childIds, status: "married" } as Union);
// дед+баба -> отец, тётя; отец+мама -> я, брат; я+жена -> сын
const people = ["ded", "baba", "otec", "tetya", "mama", "ya", "brat", "zhena", "syn", "mamaOtec"].map(P);
const unions = [U("u1", ["ded", "baba"], ["otec", "tetya"]), U("u2", ["otec", "mama"], ["ya", "brat"]), U("u3", ["ya", "zhena"], ["syn"]), U("u0", ["mamaOtec"], ["mama"])];

test("линия родства: человек и предки по обоим родителям, без потомков, братьев и супругов", () => {
  assert.deepEqual([...ancestryOf(unions, "ya")].sort(), ["baba", "ded", "mama", "mamaOtec", "otec", "ya"]);
  assert.deepEqual([...ancestryOf(unions, "ded")], ["ded"]);
});

test("цвет линии получают только предки; потомки, братья, супруги и тётя без цвета", () => {
  clearLineColors();
  setLineColor(unions, "ya", "#111111");
  const c = (id: string) => branchColorOf(people, unions, id);
  for (const id of ["ya", "otec", "mama", "ded", "baba", "mamaOtec"]) assert.equal(c(id), "#111111", id);
  for (const id of ["brat", "tetya", "zhena", "syn"]) assert.equal(c(id), undefined, id);
  setLineColor(unions, "ya", null);
  assert.equal(c("ya"), undefined);
});

test("цвет ветви по потомкам работает как раньше, цвет линии главнее для своих людей", () => {
  clearLineColors();
  setBranchColor("ded", "#222222");
  assert.equal(branchColorOf(people, unions, "syn"), "#222222", "потомок наследует");
  setLineColor(unions, "ya", "#333333");
  assert.equal(branchColorOf(people, unions, "otec"), "#333333", "линия перекрашивает свою");
  assert.equal(branchColorOf(people, unions, "tetya"), "#222222", "остальные потомки деда сохраняют цвет ветви");
  assert.equal(branchColorOf(people, unions, "syn"), "#222222");
  clearLineColors();
  assert.equal(branchColorOf(people, unions, "otec"), "#222222", "после снятия линий вернулся цвет ветви");
  assert.ok(Object.keys(getBranchColors()).every((k) => !k.startsWith("=")));
  setBranchColor("ded", null);
});

test("в круговой записи (человек сам себе предок) разбор не зацикливается", () => {
  const loop = [U("a", ["x"], ["y"]), U("b", ["y"], ["x"])];
  assert.deepEqual([...ancestryOf(loop, "x")].sort(), ["x", "y"]);
});
