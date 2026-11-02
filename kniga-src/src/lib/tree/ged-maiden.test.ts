import assert from "node:assert/strict";
import test from "node:test";
import { parseGedcom } from "./importTree.ts";

const ged = (names: string) => `0 HEAD\n0 @I1@ INDI\n${names}1 SEX F\n0 @I2@ INDI\n1 NAME Эдгар /Межов/\n1 SEX M\n0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I1@\n0 TRLR\n`;
const person = (text: string) => {
  const r = parseGedcom(text);
  assert.ok("tree" in r);
  return r.tree.people.find((p) => p.id === "I1")!;
};

test("Familio: фамилия мужа со скобкой и SURN девичьей не повторяются", () => {
  const p = person(ged("1 NAME Эрмина /Межова (Дорохина)/\n2 SURN Дорохина\n"));
  assert.equal(p.lastName, "Межова");
  assert.equal(p.maidenName, "Дорохина");
});

test("только скобка: это обычная фамилия", () => {
  const p = person(ged("1 NAME Эльвира /(Макетова)/\n2 SURN Макетова\n"));
  assert.equal(p.lastName, "Макетова");
  assert.equal(p.maidenName, undefined);
});

test("двойные фамилии и совпадающие части не портятся", () => {
  const p = person(ged("1 NAME Гертруда /Опытова-Водкина/\n2 SURN Сидорова-Сидорова\n"));
  assert.equal(p.lastName, "Опытова-Водкина");
  assert.equal(p.maidenName, "Сидорова-Сидорова");
});

test("SURN как в имени: девичьей нет", () => {
  const p = person(ged("1 NAME Гертруда /Пробина/\n2 SURN Пробина\n"));
  assert.equal(p.lastName, "Пробина");
  assert.equal(p.maidenName, undefined);
});
