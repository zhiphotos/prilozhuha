import assert from "node:assert/strict";
import test from "node:test";
import { yearNum } from "./kinship.ts";

test("год из года и из дат разной записи", () => {
  assert.equal(yearNum("1989"), 1989);
  assert.equal(yearNum("18.05.1989"), 1989);
  assert.equal(yearNum("1989-05-18"), 1989);
  assert.equal(yearNum("р. 06.01.1987"), 1987);
});
test("дата без точек: год последние четыре цифры, а не первые", () => {
  assert.equal(yearNum("18051989"), 1989);
});
test("нет года", () => {
  assert.equal(yearNum(""), 9999);
  assert.equal(yearNum(undefined), 9999);
  assert.equal(yearNum("примерно"), 9999);
});
