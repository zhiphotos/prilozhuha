// Нестабильный порядок карточек при добавлении родителей: воспроизведение на синтетической семье из 7 человек (годы и связи заданы явно).
// Причина: пара, у которой родители есть у ОБОИХ супругов, подвешивается в схеме к семье одного из них. При равной глубине предков выбор решает порядок
// супругов внутри пары (betterPrimary, layout.ts, tidyOnce). Добавили родителей «чужому» супругу: пара переезжает к новой семье и перестаёт стоять между своими братьями и сёстрами.
// Связи при этом не теряются (проверяется отдельно). Тест помечен todo: он описывает желаемое поведение и пока НЕ проходит; исправление подготовлено отдельным патчем и не применено.
import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";

const person = (id: string, o: Record<string, unknown> = {}) => ({ id, name: id, firstName: id, relation: "", birthYear: "", maidenName: "", notes: "", gender: "m", fromFile: true, parents: [] as string[], ...o });
const family = () => [
  person("p001", { spouse: "p002", birthYear: "1900" }),
  person("p002", { gender: "f", spouse: "p001", birthYear: "1901" }),
  person("p003", { parents: ["p001", "p002"], birthYear: "1925" }),
  person("p004", { gender: "f", parents: ["p001", "p002"], spouse: "p005", birthYear: "1926" }),
  person("p005", { spouse: "p004", birthYear: "1927" }),
  person("p006", { gender: "f", parents: ["p001", "p002"], spouse: "p007", birthYear: "1928" }),
  person("p007", { spouse: "p006", birthYear: "1929" }),
];
const rowOrder = (people: ReturnType<typeof family>) => {
  const t = treeFromPeople(people as never);
  const L = layoutTree(t.people, t.unions, "p007", "down");
  const rows = new Map<number, { id: string; x: number }[]>();
  for (const n of L.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), { id: n.id, x: n.x }]);
  return { rows: [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v).map((r) => r.sort((a, b) => a.x - b.x).map((n) => n.id)), unions: t.unions };
};
const edges = (people: ReturnType<typeof family>) => {
  const set = new Set<string>();
  for (const u of treeFromPeople(people as never).unions) for (const c of u.childIds) for (const a of u.partnerIds) set.add(`${a}>${c}`);
  return set;
};
const withParentsAdded = () => {
  const ppl = family().map((p) => (p.id === "p005" ? { ...p, parents: ["zf", "zm"] } : p));
  return [...ppl, person("zf", { spouse: "zm", birthYear: "1800" }), person("zm", { gender: "f", spouse: "zf", birthYear: "1801" })];
};

test("добавление родителей жене p004 НЕ теряет ни одной прежней связи (потери связей нет: перестановка это не потеря)", () => {
  const before = edges(family());
  const after = edges(withParentsAdded());
  assert.deepEqual([...before].filter((e) => !after.has(e)), []);
});

test("воспроизведение: порядок братьев и сестёр p003, p004+p005, p006+p007 в ряду ДО добавления", () => {
  assert.deepEqual(rowOrder(family()).rows[1], ["p003", "p005", "p004", "p007", "p006"]);
});

test("ЖЕЛАЕМОЕ: у прежних карточек не меняется относительный порядок, когда одному из супругов добавили родителей", { todo: "дефект, исправление в layout-primary-tiebreak.patch не применено" }, () => {
  const old = rowOrder(family()).rows[1]!;
  const after = rowOrder(withParentsAdded()).rows.find((r) => r.includes("p003"))!;
  assert.deepEqual(after.filter((id) => old.includes(id)), old);
});
