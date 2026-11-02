import assert from "node:assert/strict";
import test from "node:test";
import { centerDecision } from "./camera.ts";

test("первый запрос наводит камеру и запоминается", () => {
  assert.deepEqual(centerDecision({ id: "me", n: 5 }, 0, true), { apply: true, lastDone: 5 });
});
test("пересборка раскладки (удаление человека) тот же запрос повторно не выполняет", () => {
  assert.equal(centerDecision({ id: "me", n: 5 }, 5, true).apply, false);
});
test("новый запрос (кнопка «Ко мне», смена масштаба) выполняется", () => {
  assert.equal(centerDecision({ id: "me", n: 6 }, 5, true).apply, true);
});
test("пока человека нет в раскладке, запрос не теряется", () => {
  const first = centerDecision({ id: "me", n: 7 }, 5, false);
  assert.deepEqual(first, { apply: false, lastDone: 5 });
  assert.equal(centerDecision({ id: "me", n: 7 }, first.lastDone, true).apply, true);
});
test("без запроса камеру не трогаем", () => {
  assert.equal(centerDecision(null, 0, true).apply, false);
});
