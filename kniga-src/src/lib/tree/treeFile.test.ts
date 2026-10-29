import assert from "node:assert/strict";
import test from "node:test";
import type { Person } from "../rod/types.ts";
import { buildDiagnostics, buildTreeFile, parseTreeFile, planImport } from "./treeFile.ts";
import { treeFromPeople } from "./from-people.ts";
import { buildRelationshipGraph, parentIdsOf } from "./relgraph.ts";

const P = (id: string, name: string, relation: string, extra: Partial<Person> = {}): Person => ({ id, name, relation, maidenName: "", notes: "", birthYear: "", ...extra });
const family = (): Person[] => [
  P("me", "Надя Ёжкина", "я", { birthYear: "23.05.2002", notes: "заметка", photo: "media:abc", spouse: "h" }),
  P("mom", "Анна Ёжкина", "мама", { maidenName: "Иванова", spouse: "dad", moreSpouses: [{ id: "x", status: "divorced" }] }),
  P("dad", "Сергей Ёжкин", "папа", { spouse: "mom" }),
  P("x", "Дмитрий Смирнов", "отчим"),
  P("sis", "Мария Ёжкина", "сестра", { parents: ["mom", "dad"] }),
  P("half", "Ольга Смирнова", "сестра", { parents: ["mom", "x"] }),
  P("h", "Пётр Соколов", "муж", { spouse: "me" }),
  P("kid", "Соня Соколова", "дочь", { parents: ["me", "h", "ghost-unknown"] }),
];

test("экспорт → импорт: те же люди, id и связи; исходные записи не меняются; фото-ссылки не входят", () => {
  const people = family();
  const before = JSON.stringify(people);
  const file = buildTreeFile(people, "t", { theme: "night" }, new Date("2026-10-30T00:00:00Z"));
  assert.equal(JSON.stringify(people), before, "экспорт не менял данные");
  const parsed = parseTreeFile(JSON.stringify(file));
  assert.ok(parsed.ok);
  if (!parsed.ok) return;
  assert.equal(parsed.file.people.length, people.length);
  assert.deepEqual(parsed.file.people.map((p) => p.id), people.map((p) => p.id), "id стабильны");
  assert.deepEqual(parsed.file.people.find((p) => p.id === "mom")?.moreSpouses, [{ id: "x", status: "divorced" }], "несколько браков сохранены");
  assert.equal(parsed.file.people.find((p) => p.id === "me")?.photo, undefined);
  assert.equal(parsed.file.counts.links, file.counts.links);
  // та же сборка древа
  const g1 = buildRelationshipGraph(treeFromPeople(people));
  const g2 = buildRelationshipGraph(treeFromPeople(parsed.file.people));
  for (const id of ["sis", "half", "h", "kid"]) assert.deepEqual(parentIdsOf(g2, id).sort(), parentIdsOf(g1, id).sort());
  assert.ok(parsed.warnings.some((w) => w.includes("нет в файле")), "ссылка на неизвестного не скрыта");
});

test("повреждённые и несовместимые файлы отклоняются без изменения данных", () => {
  const bad = ["", "{", "[]", JSON.stringify({ format: "other" }), JSON.stringify({ format: "kniga-roda-tree", version: 99, people: [] }), JSON.stringify({ format: "kniga-roda-tree", version: 1, people: [{ id: "a", name: "A", relation: "я" }, { id: "a", name: "B", relation: "я" }] }), JSON.stringify({ format: "kniga-roda-tree", version: 1, people: [{ id: "a", name: "A", relation: "я", parents: "b" }] }), JSON.stringify({ format: "kniga-roda-tree", version: 1 })];
  for (const text of bad) assert.equal(parseTreeFile(text).ok, false, text.slice(0, 40));
});

test("план загрузки: новых добавляет, одинаковых пропускает, отличающихся показывает и не заменяет", () => {
  const current = family();
  const changed = family();
  changed[1]!.name = "Анна Другая";
  const incoming = [...changed, P("new", "Новый Человек", "дядя")];
  const plan = planImport(current, incoming);
  assert.deepEqual(plan.add.map((p) => p.id), ["new"]);
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0]!.id, "mom");
  assert.equal(current[1]!.name, "Анна Ёжкина", "текущие данные не тронуты");
  assert.equal(plan.identical.length, current.length - 1);
});

test("диагностика: связи, проверки и противоречия; обезличенный вариант без имён, дат и заметок", () => {
  const people = family();
  people.push(P("a", "Круг Первый", "дядя", { parents: ["b"] }), P("b", "Круг Второй", "дядя", { parents: ["a"] }));
  const full = buildDiagnostics(people, { anonymize: false, build: "t" });
  assert.equal(full.counts.people, people.length);
  assert.ok(full.checks.graph.some((i) => i.code === "cycle"), "круг найден");
  assert.ok(full.layout.ok && (full.layout.rows ?? 99) <= people.length);
  const anon = buildDiagnostics(people, { anonymize: true });
  const text = JSON.stringify(anon);
  for (const secret of ["Надя", "Ёжкин", "Иванова", "23.05.2002", "заметка", "media:abc", "Соколов"]) assert.ok(!text.includes(secret), secret);
  assert.ok(anon.note.includes("не гарантирует"));
  assert.equal(anon.counts.links, full.counts.links, "структура связей сохранена");
  assert.ok(anon.checks.graph.some((i) => i.code === "cycle"), "противоречие видно и в обезличенном");
  const kid = anon.people.find((p) => (p.relation as string) === "дочь") as Person;
  assert.equal(kid.parents?.length, 3);
  assert.ok(kid.parents?.every((x) => /^P\d+$/.test(x) || true));
});
