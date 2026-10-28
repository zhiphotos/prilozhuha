import assert from "node:assert/strict";
import test from "node:test";
import { boldParts, explodeBold, stripBold, toggleBold } from "./rich.ts";

test("жирное размечается по словам, чтобы перенос строки его не ломал", () => {
  assert.equal(explodeBold("а **два слова** б"), "а **два** **слова** б");
  assert.equal(stripBold("а **два** б"), "а два б");
});

test("непарный ** не ломает показ", () => {
  assert.deepEqual(boldParts("раз **два"), [{ text: "раз ", bold: false }, { text: "два", bold: true }]);
});

test("кнопка Ж добавляет и снимает жирный", () => {
  const on = toggleBold("привет мир", 0, 6)!;
  assert.equal(on.text, "**привет** мир");
  const off = toggleBold(on.text, on.from, on.to)!;
  assert.equal(off.text, "привет мир");
  assert.equal(toggleBold("abc", 1, 1), null);
});
