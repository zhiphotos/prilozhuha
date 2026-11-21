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

import { cameraUntouched, resizeDecision } from "./camera.ts";
const auto = { x: 10, y: 20, k: 0.5 };
test("размер области изменился, камера не тронута: подгонка нужна", () => {
  assert.equal(resizeDecision({ w: 390, h: 700 }, { w: 1280, h: 800 }, auto, auto), true);
  assert.equal(resizeDecision({ w: 1280, h: 800 }, { w: 390, h: 700 }, auto, auto), true);
});
test("первое измерение (prev нет), камера не тронута: подгонка нужна", () => {
  assert.equal(resizeDecision(null, { w: 800, h: 600 }, null, auto), true);
});
test("размер тот же (перерисовка): камера не сбрасывается", () => {
  assert.equal(resizeDecision({ w: 800, h: 600 }, { w: 800.4, h: 600.3 }, auto, auto), false);
});
test("человек двигал или приближал древо: размер окна его вид не сбрасывает", () => {
  assert.equal(resizeDecision({ w: 800, h: 600 }, { w: 400, h: 600 }, auto, { x: 50, y: 20, k: 0.5 }), false);
  assert.equal(resizeDecision({ w: 800, h: 600 }, { w: 400, h: 600 }, auto, { x: 10, y: 20, k: 0.9 }), false);
});
test("скрытая область (0×0) подгонку не запускает", () => {
  assert.equal(resizeDecision({ w: 800, h: 600 }, { w: 0, h: 0 }, auto, auto), false);
});
test("cameraUntouched: допуск 0.5 px и 0.001 по масштабу", () => {
  assert.equal(cameraUntouched(auto, { x: 10.4, y: 19.6, k: 0.5005 }), true);
  assert.equal(cameraUntouched(auto, { x: 11, y: 20, k: 0.5 }), false);
});
