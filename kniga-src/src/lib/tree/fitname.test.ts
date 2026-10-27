import assert from "node:assert/strict";
import test from "node:test";
import { fitName, fullName } from "./kinship.ts";
import type { Person } from "./types.ts";

const p = (firstName: string, patronymic: string, lastName: string): Person => ({ id: "1", firstName, patronymic, lastName, gender: "u", birthYear: "", deathYear: "", photo: "", note: "" });

test("полное ФИО: имя, отчество, фамилия", () => {
  assert.equal(fullName(p("Иван", "Петрович", "Фёдоров")), "Иван Петрович Фёдоров");
  assert.equal(fullName(p("Мария", "", "")), "Мария");
  assert.equal(fullName(p("", "", "")), "Без имени");
});
test("короткое имя остаётся крупным, длинное уменьшается и не вылезает", () => {
  assert.equal(fitName(p("Иван", "", "Фёдоров"), 154, 16).size, 16);
  const long = fitName(p("Александра", "Константиновна", "Пономарёва-Свиридова"), 154, 16);
  assert.ok(long.size < 16 && long.size >= 9);
  assert.ok(long.textLength === 154);
});
