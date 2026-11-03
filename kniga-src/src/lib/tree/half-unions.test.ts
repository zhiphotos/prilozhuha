import test from "node:test";
import assert from "node:assert/strict";
import { halfUnionIds } from "./half-unions.ts";
import { treeFromPeople } from "./from-people.ts";

const u = (id: string, partnerIds: string[], childIds: string[], startYear = "") => ({ id, partnerIds, childIds, startYear });
const R = (id: string, name: string, relation: string, extra: Record<string, unknown> = {}) => ({ id, name, relation, maidenName: "", notes: "", birthYear: "", ...extra });

test("полная пара сплошная, союз с одним известным родителем пунктиром (случай Natali)", () => {
  assert.deepEqual([...halfUnionIds([u("u1", ["alla"], ["alexey"]), u("u2", ["maxim", "alla"], ["maria"])])], ["u1"]);
  assert.deepEqual([...halfUnionIds([u("u2", ["maxim", "alla"], ["maria"]), u("u1", ["alla"], ["alexey"])])], ["u1"]);
});
test("два полных союза: сплошным остаётся более ранний брак, при любом порядке записи", () => {
  const a = u("a", ["p", "q"], ["x"], "1970");
  const b = u("b", ["p", "r"], ["y"], "1985");
  assert.deepEqual([...halfUnionIds([a, b])], ["b"]);
  assert.deepEqual([...halfUnionIds([b, a])], ["b"]);
});
test("нет годов брака: решает самый старший ребёнок", () => {
  const people = [{ id: "x", birthYear: "1975" }, { id: "y", birthYear: "1990" }];
  const a = u("a", ["p", "q"], ["x"]);
  const b = u("b", ["p", "r"], ["y"]);
  assert.deepEqual([...halfUnionIds([a, b], people)], ["b"]);
  assert.deepEqual([...halfUnionIds([b, a], people)], ["b"]);
});
test("нет никаких данных: выбор по идентификаторам партнёров, одинаково при любом порядке", () => {
  const a = u("a", ["p", "q"], ["x"]);
  const b = u("b", ["p", "r"], ["y"]);
  assert.deepEqual([...halfUnionIds([a, b])], [...halfUnionIds([b, a])]);
  assert.equal(halfUnionIds([a, b]).size, 1);
});
test("один союз или без детей: пунктира нет", () => {
  assert.equal(halfUnionIds([u("a", ["p", "q"], ["x"]), u("b", ["p", "r"], [])]).size, 0);
});

function perms<T>(a: T[]): T[][] { return a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])); }
function lines(people: ReturnType<typeof R>[]): string {
  const data = treeFromPeople(people as never);
  const half = halfUnionIds(data.unions, data.people);
  const out: string[] = [];
  for (const un of data.unions) for (const c of un.childIds) out.push(`${c}:${[...un.partnerIds].sort().join("+")}:${half.has(un.id) ? "dash" : "solid"}`);
  return out.sort().join("|");
}
test("порядок внесения людей не влияет на результат (повторный брак, несколько союзов, один родитель)", () => {
  const families: Record<string, ReturnType<typeof R>[]> = {
    "повторный брак без годов": [R("me", "Я", "я", { gender: "f" }), R("f", "Отец", "папа", { gender: "m" }), R("m1", "М1", "мама", { gender: "f" }), R("m2", "М2", "мачеха", { gender: "f" }), R("k1", "Д1", "сестра", { gender: "f", parents: ["f", "m1"] }), R("k2", "Д2", "сестра", { gender: "f", parents: ["f", "m2"] })],
    "повторный брак с годами рождения": [R("me", "Я", "я", { gender: "f" }), R("f", "Отец", "папа", { gender: "m" }), R("m1", "М1", "мама", { gender: "f" }), R("m2", "М2", "мачеха", { gender: "f" }), R("k1", "Д1", "сестра", { gender: "f", birthYear: "1980", parents: ["f", "m1"] }), R("k2", "Д2", "сестра", { gender: "f", birthYear: "1995", parents: ["f", "m2"] })],
    "три союза у матери": [R("me", "Я", "я", { gender: "f" }), R("mom", "Мать", "мама", { gender: "f" }), R("d1", "О1", "отец", { gender: "m" }), R("d2", "О2", "отчим", { gender: "m" }), R("a", "А", "брат", { gender: "m", parents: ["mom", "d1"] }), R("b", "Б", "брат", { gender: "m", parents: ["mom", "d2"] }), R("c", "В", "брат", { gender: "m", parents: ["mom"] })],
  };
  for (const [name, people] of Object.entries(families)) {
    const seen = new Set(perms(people).map(lines));
    assert.equal(seen.size, 1, `${name}: вариантов отображения ${seen.size}`);
  }
});
