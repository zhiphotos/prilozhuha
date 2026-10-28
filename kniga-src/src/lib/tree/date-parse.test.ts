import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDate } from "./date-parse.ts";

test("полная дата GED сохраняет день и месяц", () => {
  assert.equal(normalizeDate("23 MAY 2002"), "23.05.2002");
  assert.equal(normalizeDate("3 Jan 1946"), "03.01.1946");
});
test("месяц и год, только год", () => {
  assert.equal(normalizeDate("MAY 2002"), "05.2002");
  assert.equal(normalizeDate("1990"), "1990");
});
test("около и между: остаётся первая дата", () => {
  assert.equal(normalizeDate("ABT 1900"), "1900");
  assert.equal(normalizeDate("BET 1900 AND 1910"), "1900");
  assert.equal(normalizeDate("BEF 12 MAR 1900"), "12.03.1900");
});
test("числовые и русские формы", () => {
  assert.equal(normalizeDate("2002-05-23"), "23.05.2002");
  assert.equal(normalizeDate("23/05/2002"), "23.05.2002");
  assert.equal(normalizeDate("23 мая 2002 г."), "23.05.2002");
});
test("пустое и вопросы", () => {
  assert.equal(normalizeDate("?"), "");
  assert.equal(normalizeDate(undefined), "");
});

import { normalizeDate as normalizeJulian } from "./date-parse.ts";
test("метка календаря GEDCOM не отбрасывает день и месяц", () => {
  assert.equal(normalizeJulian("@#DJULIAN@ 12 OCT 1890"), "12.10.1890");
  assert.equal(normalizeJulian("EST @#DJULIAN@ 1890"), "1890");
  assert.equal(normalizeJulian("BEF @#DJULIAN@ 3 JAN 1900"), "03.01.1900");
});
