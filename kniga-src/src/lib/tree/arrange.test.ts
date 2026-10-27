import assert from "node:assert/strict";
import test from "node:test";
import { flipSpouse, moveBranch } from "./arrange.ts";
import { layoutTree } from "./layout.ts";
import type { Person, Union } from "./types.ts";

const p = (id: string, gender: Person["gender"], extra: Partial<Person> = {}): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "", ...extra });
const u = (id: string, partnerIds: string[], childIds: string[]): Union => ({ id, partnerIds, childIds, status: "married", startYear: "", endYear: "" });

test("поменять супругов местами: муж слева по умолчанию, после флипа справа", () => {
  const people = [p("h", "m"), p("w", "f")];
  const unions = [u("u1", ["h", "w"], [])];
  const before = new Map(layoutTree(people, unions, "h").nodes.map((n) => [n.id, n.x]));
  assert.ok(before.get("h")! < before.get("w")!);
  const patches = flipSpouse(people, unions, "h", "h");
  const flipped = people.map((x) => ({ ...x, side: patches.find((q) => q.id === x.id)?.side ?? undefined }));
  const after = new Map(layoutTree(flipped, unions, "h").nodes.map((n) => [n.id, n.x]));
  assert.ok(after.get("h")! > after.get("w")!);
});

test("ветка двигается вправо: старшие предки меняются местами", () => {
  // два корня: пара a1+a2 и пара b1+b2; у каждой по ребёнку; по году рождения a левее b.
  const people = [p("a1", "m", { birthYear: "1900" }), p("a2", "f", { birthYear: "1901" }), p("b1", "m", { birthYear: "1905" }), p("b2", "f", { birthYear: "1906" }), p("ca", "m"), p("cb", "f")];
  const unions = [u("ua", ["a1", "a2"], ["ca"]), u("ub", ["b1", "b2"], ["cb"]), u("uc", ["ca", "cb"], [])];
  const x0 = new Map(layoutTree(people, unions, "ca").nodes.map((n) => [n.id, n.x]));
  assert.ok(x0.get("a1")! < x0.get("b1")!);
  const patches = moveBranch(people, unions, "ca", "ca", 1);
  assert.ok(patches.length > 0);
  const ranked = people.map((x) => ({ ...x, rank: patches.find((q) => q.id === x.id)?.rank }));
  const x1 = new Map(layoutTree(ranked, unions, "ca").nodes.map((n) => [n.id, n.x]));
  assert.ok(x1.get("a1")! > x1.get("b1")!);
});

test("крайнюю ветку дальше не двигаем", () => {
  const people = [p("a1", "m", { birthYear: "1900" }), p("b1", "m", { birthYear: "1905" })];
  assert.deepEqual(moveBranch(people, [], "a1", "a1", -1), []);
});
