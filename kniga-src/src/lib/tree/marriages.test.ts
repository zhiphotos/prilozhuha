import assert from "node:assert/strict";
import test from "node:test";
import type { Person } from "../rod/types.ts";
import { applyMarriages, marriagesOf, withMarriages } from "./marriages.ts";

const R = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, relation: "", maidenName: "", notes: "", birthYear: "", ...extra });
const apply = (people: Person[], patches: Record<string, Partial<Person>>) => people.map((p) => (patches[p.id] ? { ...p, ...patches[p.id] } : p));

test("связь записана только у мужа: у жены она видна как выбранный супруг", () => {
  const people = [R("m", { spouse: "w", spouseStatus: "divorced" }), R("w")];
  assert.deepEqual(marriagesOf(people, "w"), [{ id: "m", status: "divorced", holder: "m" }]);
  const shown = withMarriages(people, people[1]!);
  assert.equal(shown.spouse, "m");
  assert.equal(shown.spouseStatus, "divorced");
  assert.equal(people[1]!.spouse, undefined, "данные не изменены");
});

test("повторный брак: у мужа видны обе жены, у каждой жены виден муж", () => {
  const people = [R("h", { spouse: "w1" }), R("w1"), R("w2", { spouse: "h", spouseStatus: "partners" })];
  assert.deepEqual(marriagesOf(people, "h").map((m) => [m.id, m.status]), [["w1", "married"], ["w2", "partners"]]);
  assert.equal(withMarriages(people, people[0]!).moreSpouses?.[0]?.id, "w2");
  assert.equal(withMarriages(people, people[1]!).spouse, "h");
  assert.equal(withMarriages(people, people[2]!).spouse, "h");
});

test("статус брака, записанного у другого, меняется у того, кто его хранит; остальные записи не трогаются", () => {
  const people = [R("h", { spouse: "w1" }), R("w1"), R("w2", { spouse: "h" })];
  const patches = applyMarriages(people, "h", [{ id: "w1", status: "married" }, { id: "w2", status: "divorced" }]);
  assert.deepEqual(patches, { w2: { spouseStatus: "divorced" } });
});

test("убрать брак, записанный у другого: стирается связь у него, у других ничего", () => {
  const people = [R("h", { spouse: "w1" }), R("w1"), R("w2", { spouse: "h", spouseStatus: "divorced" }), R("x", { spouse: "y" }), R("y")];
  const after = apply(people, applyMarriages(people, "h", [{ id: "w1" }]));
  assert.equal(after.find((p) => p.id === "w2")!.spouse, undefined);
  assert.equal(after.find((p) => p.id === "h")!.spouse, "w1");
  assert.deepEqual(after.filter((p) => p.id === "x" || p.id === "y"), people.filter((p) => p.id === "x" || p.id === "y"));
});

test("добавить брак: записывается у самого человека, чужие записи не меняются", () => {
  const people = [R("m"), R("w1"), R("w2")];
  const patches = applyMarriages(people, "m", [{ id: "w1", status: "married" }, { id: "w2", status: "widowed" }]);
  assert.deepEqual(Object.keys(patches), ["m"]);
  assert.equal(patches.m!.spouse, "w1");
  assert.deepEqual(patches.m!.moreSpouses, [{ id: "w2", status: "widowed" }]);
});

test("заменить супруга в браке, записанном у другого: старая связь стёрта у него, новая записана у человека", () => {
  const people = [R("h", { spouse: "w" }), R("w"), R("n")];
  const after = apply(people, applyMarriages(people, "w", [{ id: "n" }]));
  assert.equal(after.find((p) => p.id === "h")!.spouse, undefined);
  assert.equal(after.find((p) => p.id === "w")!.spouse, "n");
});

test("пустая строка «ещё брак» не теряется, пока брак не выбран", () => {
  const people = [R("h", { spouse: "w1", moreSpouses: [{ id: "" }] }), R("w1")];
  assert.equal(withMarriages(people, people[0]!).moreSpouses?.length, 1);
  const patches = applyMarriages(people, "h", [{ id: "w1" }, { id: "" }]);
  assert.deepEqual(patches, {}, "без изменений ничего не пишем");
});
