import assert from "node:assert/strict";
import test from "node:test";
import { maskDate } from "./date-input.ts";

test("только год остаётся годом", () => assert.equal(maskDate("1989"), "1989"));
test("восемь цифр становятся датой с точками", () => assert.equal(maskDate("18051989"), "18.05.1989"));
test("набор по одной цифре", () => {
  assert.equal(maskDate("18051"), "18.05.1");
  assert.equal(maskDate("180519"), "18.05.19");
});
test("точки, поставленные вручную, сохраняются", () => {
  assert.equal(maskDate("05.1989"), "05.1989");
  assert.equal(maskDate("18.05.1989"), "18.05.1989");
  assert.equal(maskDate("18/05/1989"), "18.05.1989");
});
test("стирание не ломает дату", () => assert.equal(maskDate("18.05."), "18.05."));
