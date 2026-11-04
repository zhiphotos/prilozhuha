import assert from "node:assert/strict";
import test from "node:test";
import { cardLine } from "./card-fields.ts";
import type { Person } from "./types.ts";

const person = (o: Partial<Person> = {}): Person => ({ id: "a", firstName: "А", patronymic: "", lastName: "", gender: "f", birthYear: "1948", deathYear: "", photo: "", note: "", ...o });

test("по умолчанию только годы", () => {
  assert.equal(cardLine(person(), "р. 1948", { years: true, age: false, place: false }), "р. 1948");
});

test("место рождения добавляется через точку, длинное сокращается", () => {
  assert.equal(cardLine(person({ birthPlace: "Тбилиси" }), "р. 1948", { years: true, age: false, place: true }), "р. 1948 · Тбилиси");
  const long = cardLine(person({ birthPlace: "Село Верхние Нижние Горки" }), "р. 1948", { years: false, age: false, place: true });
  assert.ok(long.length <= 18 && long.endsWith("…"));
});

test("если выбрано только место, а его нет, показываются годы", () => {
  assert.equal(cardLine(person(), "р. 1948", { years: false, age: false, place: true }), "р. 1948");
});

test("возраст показывается в скобках после годов", () => {
  const line = cardLine(person({ birthYear: "1900", deathYear: "1980" }), "1900 – 1980", { years: true, age: true, place: false });
  assert.match(line, /^1900 – 1980 \(.+\)$/);
});
