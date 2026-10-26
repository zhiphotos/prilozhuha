import assert from "node:assert/strict";
import test from "node:test";
import { parseTable } from "./tableImport.ts";

test("таблица CSV с родителями и супругом", () => {
  const csv = "Фамилия;Имя;Отчество;Год рождения;Пол;Кем приходится;Отец;Мать;Супруг\nПетров;Сергей;Иванович;1960;м;папа;;;Петрова Анна Ивановна\nПетрова;Анна;Ивановна;1962;ж;мама;;;Петров Сергей Иванович\nПетрова;Катя;;1990;ж;сестра;Петров Сергей Иванович;Петрова Анна Ивановна;";
  const r = parseTable(csv);
  assert.ok("people" in r);
  if (!("people" in r)) return;
  assert.equal(r.people.length, 3);
  assert.equal(r.people[2]!.parentKeys.length, 2);
  assert.equal(r.people[0]!.spouseKey, "t2");
  assert.equal(r.people[1]!.gender, "f");
  assert.ok("error" in parseTable("Привет\n1"));
});
