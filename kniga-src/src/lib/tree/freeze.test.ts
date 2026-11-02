import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { treeFromPeople } from "./from-people.ts";
import { freezeDerivedParents } from "./freeze.ts";
import type { Person } from "@/lib/rod/types";

const edges = (people: Person[]) => {
  const t = treeFromPeople(people);
  const set = new Set<string>();
  for (const u of t.unions) for (const c of u.childIds) for (const a of u.partnerIds) set.add(`${a}>${c}`);
  return set;
};
const blank = (people: Person[], id: string) => people.map((p) => (p.id === id ? { ...p, relation: "не указано" } : p));

const p = (id: string, relation: string, extra: Partial<Person> = {}): Person => ({ id, name: id, relation, birthYear: "", maidenName: "", notes: "", ...extra });

test("стирание подписи не рвёт связь, выведенную по слову", () => {
  const people = [p("me", "я"), p("mo", "Мама", { spouse: "fa" }), p("fa", "Папа", { spouse: "mo" }), p("br", "Брат")];
  const before = edges(people);
  const frozen = freezeDerivedParents(people);
  // после записи связей любая правка подписей не меняет схему
  for (const x of people) assert.deepEqual([...edges(blank(frozen, x.id))].sort(), [...before].sort(), `подпись ${x.id}`);
});

test("явные связи и люди из файла не трогаются", () => {
  const people = [p("me", "я", { parents: ["mo"] }), p("mo", "Мама", { fromFile: true })];
  assert.equal(freezeDerivedParents(people), people);
});

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/diag-1029-anon.json", import.meta.url)), "utf8")) as { people: Person[] };

test("файл 29.10 (обезличенный): связи сохраняются при изменении и очистке подписи, перезагрузке и правке других полей", () => {
  const people = fixture.people;
  const before = [...edges(people)].sort();
  const frozen = freezeDerivedParents(people);
  assert.deepEqual([...edges(frozen)].sort(), before, "заморозка не меняет схему");
  // изменение подписи любого человека
  for (const x of people) {
    const relabeled = frozen.map((p) => (p.id === x.id ? { ...p, relation: "любимый родственник" } : p));
    assert.deepEqual([...edges(relabeled)].sort(), before, `смена подписи ${x.id}`);
  }
  // очистка подписи
  for (const x of people) assert.deepEqual([...edges(blank(frozen, x.id))].sort(), before, `очистка подписи ${x.id}`);
  // перезагрузка: данные записаны и прочитаны заново
  const reloaded = JSON.parse(JSON.stringify(frozen)) as Person[];
  assert.deepEqual([...edges(reloaded)].sort(), before, "после перезагрузки");
  // правка других полей
  const edited = reloaded.map((p, i) => ({ ...p, name: `${p.name} ${i}`, notes: "заметка", birthYear: "1900" }));
  assert.deepEqual([...edges(edited)].sort(), before, "после правки имён, дат и заметок");
  // повторное открытие: замораживание второй раз ничего не добавляет
  assert.equal(freezeDerivedParents(reloaded), reloaded);
});
