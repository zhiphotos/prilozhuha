import test from "node:test";
import assert from "node:assert/strict";
import { canHaveMaiden, relationCore } from "./content.ts";
import { genderOf, maidenAllowed } from "./person.ts";

test("приставки родства не мешают: «Двоюродный дедушка» это мужчина", () => {
  assert.equal(relationCore("Двоюродный дедушка"), "дедушка");
  assert.equal(relationCore("Муж двоюродной сестры"), "Муж двоюродной сестры");
  for (const r of ["Двоюродный дедушка", "Троюродный дядя", "Муж двоюродной сестры", "Младший сводный брат", "Двоюродный дядя", "Свёкор", "Деверь", "Четвероюродный брат"]) {
    assert.equal(canHaveMaiden(r), false, `${r}: девичью фамилию не спрашиваем`);
    assert.equal(genderOf({ relation: r }), "m", `${r}: мужчина`);
  }
});

test("женщинам по-прежнему можно: бабушка, тётя, двоюродная бабушка, свекровь", () => {
  for (const r of ["Бабушка", "Двоюродная бабушка", "Троюродная тётя", "Свекровь", "Младшая сводная сестра", "Жена дяди", "Мачеха"]) {
    assert.equal(canHaveMaiden(r), true, `${r}: можно`);
    assert.equal(genderOf({ relation: r }), "f", `${r}: женщина`);
  }
});

test("неопределённое («я», «не указано», «ребёнок») остаётся без пола, поле девичьей фамилии доступно", () => {
  for (const r of ["я", "не указано", "ребёнок", ""]) {
    assert.equal(genderOf({ relation: r }), undefined);
    assert.equal(maidenAllowed({ relation: r }), true);
  }
});

test("выбранный руками пол сильнее слова", () => {
  assert.equal(maidenAllowed({ relation: "Двоюродная бабушка", gender: "m" }), false);
  assert.equal(maidenAllowed({ relation: "Двоюродный дедушка", gender: "f" }), true);
});
