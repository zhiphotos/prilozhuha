import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople } from "./from-people.ts";
import { kinship } from "./kinship.ts";
import { scopeFilter } from "./scope.ts";

const mk = (id: string, name: string, relation: string, extra: Record<string, unknown> = {}) => ({ id, name, relation, birthYear: "", deathYear: "", notes: "", fromFile: true, ...extra });

// Я; мама и папа; бабушка с дедушкой (родители папы); двоюродная тётя (сестра дедушки) и её родители.
const people = [
  mk("me", "Надя Ёжкина", "я", { parents: ["mom", "dad"] }),
  mk("mom", "Елена", "Мать"),
  mk("dad", "Александр", "Отец", { parents: ["gm", "gf"] }),
  mk("gm", "Бабушка", "Бабушка"),
  mk("gf", "Дедушка", "Дедушка", { parents: ["pgm", "pgf"], spouse: "gm" }),
  mk("pgm", "Прабабушка", "Прабабушка"),
  mk("pgf", "Прадед", "Прадедушка"),
  mk("aunt", "Ирина", "Двоюродная бабушка", { parents: ["pgm", "pgf"] }),
];

test("импортированная двоюродная родня сохраняет родителей (слово «двоюродный» не делает её моей сестрой)", () => {
  const t = treeFromPeople(people as never);
  assert.ok(t.unions.some((u) => u.childIds.includes("aunt") && u.partnerIds.includes("pgm") && u.partnerIds.includes("pgf")));
  assert.equal(kinship(t.people, t.unions, t.focusId, "aunt").card, "Двоюродная бабушка");
});

test("несколько браков: все супруги остаются в древе", () => {
  const list = [
    ...people,
    mk("w1", "Первая жена", "Жена дедушки"),
    mk("w2", "Вторая жена", "Жена дедушки"),
  ].map((p) => (p.id === "dad" ? { ...p, spouse: "mom", moreSpouses: [{ id: "w2", status: "divorced" }] } : p));
  const t = treeFromPeople(list as never);
  assert.ok(t.unions.some((u) => u.partnerIds.includes("dad") && u.partnerIds.includes("w2")));
});

test("режим «прямые» от меня показывает всю линию, а не только маму", () => {
  const t = treeFromPeople(people as never);
  const direct = scopeFilter(t.people, t.unions, t.focusId, "direct");
  assert.ok(direct.people.length >= 7);
});
