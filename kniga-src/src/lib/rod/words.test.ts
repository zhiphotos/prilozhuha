import assert from "node:assert/strict";
import test from "node:test";
import { splitWords } from "./words.ts";

test("несколько пробелов внутри текста сохраняются при переносе по словам", () => {
  const words = splitWords("Нонна          и Ксения");
  assert.equal(words.join(" ").replace(/ /g, " "), "Нонна          и Ксения", "число пробелов то же");
  assert.equal(words.length, 3);
});

test("обычный текст не меняется, лишние пробелы в конце и начале слов не плодятся", () => {
  assert.deepEqual(splitWords("один два  три "), ["один", "два ", "три"]);
  assert.deepEqual(splitWords("   красная строка"), ["красная", "строка"]);
  assert.deepEqual(splitWords("   "), []);
});
