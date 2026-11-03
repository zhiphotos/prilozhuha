import assert from "node:assert/strict";
import test from "node:test";
import { justifyGap, lastLinesOf } from "./justify.ts";

test("строка растягивается на недостающую ширину поровну между словами", () => {
  assert.equal(justifyGap(90, 100, "раз два три четыре"), 10 / 3);
});

test("полная строка, одно слово и красная строка не растягиваются неправильно", () => {
  assert.equal(justifyGap(100, 100, "раз два"), 0);
  assert.equal(justifyGap(50, 100, "слово"), 0);
  assert.equal(justifyGap(90, 100, "  раз два"), 10); // пробелы в начале не считаются
});

test("добавка к пробелу ограничена, чтобы короткая строка не разваливалась", () => {
  assert.equal(justifyGap(10, 100, "а б", 2), 2);
});

test("последние строки абзацев определяются, пустые абзацы тоже", () => {
  const lines = ["раз два три", "четыре", "", "пять шесть"];
  assert.deepEqual(lastLinesOf("раз два три четыре\n\nпять шесть", lines), [false, true, true, true]);
});
