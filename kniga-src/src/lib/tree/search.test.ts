import assert from "node:assert/strict";
import test from "node:test";
import { searchPeople } from "./search.ts";
import type { Person } from "./types.ts";

const p = (id: string, lastName: string, firstName: string, patronymic = "", birthYear = ""): Person => ({ id, firstName, patronymic, lastName, gender: "u", birthYear, deathYear: "", photo: "", note: "" });
const people = [
  p("1", "Фёдоров", "Иван", "Петрович", "1901"),
  p("2", "Иванова", "Мария", "Ивановна", "1930"),
  p("3", "Балануца", "Дарина"),
  p("4", "Петров", "Фёдор", "Иванович", "1925"),
];

test("по началу слова и ё как е", () => {
  assert.deepEqual(searchPeople(people, "федо").map((x) => x.id).sort(), ["1", "4"]);
});
test("несколько слов в любом порядке", () => {
  assert.deepEqual(searchPeople(people, "иван фед").map((x) => x.id), ["1", "4"]);
  assert.deepEqual(searchPeople(people, "мария иванова").map((x) => x.id), ["2"]);
});
test("точное совпадение выше частичного", () => {
  assert.equal(searchPeople(people, "иван")[0].id, "1");
});
test("по году и пустой запрос", () => {
  assert.deepEqual(searchPeople(people, "1925").map((x) => x.id), ["4"]);
  assert.deepEqual(searchPeople(people, "  "), []);
});
test("нет совпадений", () => {
  assert.deepEqual(searchPeople(people, "яяя"), []);
});
