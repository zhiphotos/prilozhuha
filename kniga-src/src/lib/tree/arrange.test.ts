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

test("ребёнок брака стоит посередине под родителями, а его пара рядом", () => {
  const people = [p("f", "m"), p("m", "f"), p("a", "m", { birthYear: "1980" }), p("b", "f", { birthYear: "1983" }), p("aw", "f"), p("kid", "m")];
  const unions = [u("u0", ["f", "m"], ["a", "b"]), u("u1", ["a", "aw"], ["kid"])];
  const x = new Map(layoutTree(people, unions, "a").nodes.map((n) => [n.id, n.x]));
  assert.equal(x.get("kid"), (x.get("a")! + x.get("aw")!) / 2, "дети брака посередине под своими родителями");
  assert.equal(x.get("a"), (x.get("f")! + x.get("m")!) / 2, "родители прямо над выбранным, а не над серединой всех детей");
  assert.ok(x.get("a")! < x.get("b")!, "старший слева");
});

test("восходящая схема: каждый под своими родителями, ребёнок посередине между родителями", () => {
  // Поколения как на схеме: 8-9, 10-11 → деды 4, 5 → отец 2; 12-13, 14-15 → 6, 7 → мать 3; я = 1.
  const ids = ["g8", "g9", "g10", "g11", "g12", "g13", "g14", "g15", "d4", "d5", "d6", "d7", "f2", "m3", "me"];
  const people = ids.map((id) => p(id, ["g9", "g11", "g13", "g15", "d5", "d7", "m3"].includes(id) ? "f" : "m"));
  const unions = [u("a", ["g8", "g9"], ["d4"]), u("b", ["g10", "g11"], ["d5"]), u("c", ["g12", "g13"], ["d6"]), u("d", ["g14", "g15"], ["d7"]), u("e", ["d4", "d5"], ["f2"]), u("f", ["d6", "d7"], ["m3"]), u("g", ["f2", "m3"], ["me"])];
  const x = new Map(layoutTree(people, unions, "me").nodes.map((n) => [n.id, n.x]));
  const mid = (a: string, b: string) => (x.get(a)! + x.get(b)!) / 2;
  assert.equal(x.get("d4"), mid("g8", "g9"), "дед под своими родителями");
  assert.equal(x.get("d5"), mid("g10", "g11"), "бабушка под своими родителями");
  assert.equal(x.get("f2"), mid("d4", "d5"), "отец посередине между своими родителями");
  assert.equal(x.get("m3"), mid("d6", "d7"), "мать посередине между своими родителями");
  assert.equal(x.get("me"), mid("f2", "m3"), "я посередине между родителями");
  assert.ok(x.get("f2")! < x.get("m3")!, "отец слева, мать справа");
});

import { genitivePhrase } from "./kinship.ts";
test("родство в родительном падеже для подписи «жена троюродной бабушки»", () => {
  assert.equal(genitivePhrase("Троюродная бабушка"), "троюродной бабушки");
  assert.equal(genitivePhrase("Двоюродный брат"), "двоюродного брата");
  assert.equal(genitivePhrase("Тётя"), "тёти");
});
