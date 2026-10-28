import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople } from "./from-people.ts";
import { kinship } from "./kinship.ts";

const mk = (id: string, name: string, relation: string, extra: Record<string, unknown> = {}) => ({ id, name, relation, birthYear: "", deathYear: "", notes: "", ...extra });

test("брат мужа встаёт в ветку мужа и подписан деверем", () => {
  const people = [mk("me", "Анна", "я"), mk("h", "Иван", "муж"), mk("b", "Пётр", "брат мужа")];
  const t = treeFromPeople(people as never);
  const parents = t.unions.find((u) => u.childIds.includes("h"));
  assert.ok(parents, "у мужа есть родительский союз");
  assert.ok(parents!.childIds.includes("b"), "брат рядом с мужем");
  assert.equal(kinship(t.people, t.unions, t.focusId, "b").card, "Деверь");
});

test("сестра жены не путается с моей сестрой", () => {
  const people = [mk("me", "Иван", "я", { gender: "m" }), mk("w", "Анна", "жена"), mk("s", "Ольга", "сестра жены")];
  const t = treeFromPeople(people as never);
  assert.equal(kinship(t.people, t.unions, t.focusId, "s").card, "Свояченица");
});

test("брат, у которого по ошибке выбран родитель «я», остаётся братом", () => {
  const people = [mk("o", "Оксана", "мама"), mk("e", "Евгений", "отец"), mk("a", "Александра", "я"), mk("s", "Сергей", "брат", { parents: ["a"] })];
  const t = treeFromPeople(people as never);
  assert.equal(kinship(t.people, t.unions, t.focusId, "s").card, "Брат");
});
