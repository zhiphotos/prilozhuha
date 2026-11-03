import test from "node:test";
import assert from "node:assert/strict";
import { filterPeople } from "./people-filter.ts";
import type { Person } from "./types.ts";

const p = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, relation: "", birthYear: "", maidenName: "", notes: "", ...extra }) as Person;
const list = [p("1", "Фёдорова Анна Ивановна", { relation: "бабушка", birthYear: "1931", maidenName: "Петрова" }), p("2", "Иванов Пётр"), p("3", "Жижина Мария", { notes: "жила в Омске" })];

test("пустой запрос возвращает всех", () => {
  assert.equal(filterPeople(list, "  ").length, 3);
});
test("ё и е, слова в любом порядке", () => {
  assert.deepEqual(filterPeople(list, "федорова анна").map((x) => x.id), ["1"]);
  assert.deepEqual(filterPeople(list, "анна федо").map((x) => x.id), ["1"]);
});
test("по девичьей фамилии, году, родству и заметке", () => {
  assert.deepEqual(filterPeople(list, "петрова").map((x) => x.id), ["1"]);
  assert.deepEqual(filterPeople(list, "1931").map((x) => x.id), ["1"]);
  assert.deepEqual(filterPeople(list, "бабуш").map((x) => x.id), ["1"]);
  assert.deepEqual(filterPeople(list, "омск").map((x) => x.id), ["3"]);
});
test("не находит лишнего", () => {
  assert.equal(filterPeople(list, "сидоров").length, 0);
});
