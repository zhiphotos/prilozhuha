import test from "node:test";
import assert from "node:assert/strict";
import { needsMaidenName } from "./person.ts";

const p = (relation: string, extra: Record<string, unknown> = {}) => ({ relation, maidenName: "", ...extra }) as never;

test("дедушка по маме не получает вопрос про девичью фамилию (жалоба тестировщицы)", () => {
  assert.equal(needsMaidenName(p("дедушка по маме")), false);
  assert.equal(needsMaidenName(p("дедушка", { gender: "m" })), false);
  assert.equal(needsMaidenName(p("папа")), false);
});
test("пол, выбранный руками, главнее слов в «Кем приходится»", () => {
  assert.equal(needsMaidenName(p("мама", { gender: "m" })), false);
});
test("мама и бабушки без записанной фамилии получают вопрос", () => {
  assert.equal(needsMaidenName(p("мама")), true);
  assert.equal(needsMaidenName(p("бабушка по папе")), true);
  assert.equal(needsMaidenName(p("бабушка", { maidenName: "Петрова" })), false);
});
test("прапрабабушка без выбранного пола получает вопрос, прапрадедушка нет", () => {
  assert.equal(needsMaidenName(p("прапрабабушка")), true);
  assert.equal(needsMaidenName(p("прапрадедушка")), false);
});
test("родственник по маме, но мужчина, вопроса не получает; женщина по маме получает", () => {
  assert.equal(needsMaidenName(p("мамин брат")), false);
  assert.equal(needsMaidenName(p("дедушка по маме")), false);
  assert.equal(needsMaidenName(p("прадедушка по маме")), false);
  assert.equal(needsMaidenName(p("бабушка по маме")), true);
  assert.equal(needsMaidenName(p("мама мужа")), true);
});
