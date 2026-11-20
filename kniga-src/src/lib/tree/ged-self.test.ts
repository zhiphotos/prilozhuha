// Кто «я» при загрузке файла: без выбора человека чужой «Я» не назначается. Данные вымышленные.
import assert from "node:assert/strict";
import test from "node:test";
import type { Person as RodPerson } from "@/lib/rod/types";
import { parseGedcom } from "./importTree.ts";
import { guessSelf } from "./ged-match.ts";

const indi = (id: string, name: string) => `0 @${id}@ INDI\n1 NAME ${name}\n1 SEX M\n`;
const tree = (body: string) => {
  const r = parseGedcom(`0 HEAD\n1 SOUR TEST\n${body}0 TRLR\n`);
  assert.ok("tree" in r);
  return r.tree;
};
const rod = (first: string, last: string, over: Partial<RodPerson> = {}): RodPerson => ({ id: "me", name: `${first} ${last}`, firstName: first, patronymic: "", lastName: last, relation: "я", birthYear: "", maidenName: "", notes: "", ...over });

test("в книге нет «я»: из файла никто не назначается, выбор за человеком", () => {
  const t = tree(indi("I1", "Рыцарь /Древний/") + indi("I2", "Лука /Тестов/"));
  assert.equal(guessSelf(t, []), "");
  assert.equal(guessSelf(t, [rod("Лука", "Тестов", { relation: "брат" })]), "");
});

test("в книге есть «я»: находится единственный совпавший человек", () => {
  const t = tree(indi("I1", "Рыцарь /Древний/") + indi("I2", "Лука /Тестов/"));
  const id = guessSelf(t, [rod("Лука", "Тестов")]);
  assert.equal(t.people.find((p) => p.id === id)?.firstName, "Лука");
});

test("несколько тёзок: выбор за человеком", () => {
  const t = tree(indi("I1", "Лука /Тестов/") + indi("I2", "Лука /Тестов/"));
  assert.equal(guessSelf(t, [rod("Лука", "Тестов")]), "");
});
