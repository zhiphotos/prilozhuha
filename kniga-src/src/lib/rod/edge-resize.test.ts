import test from "node:test";
import assert from "node:assert/strict";
import { resizeByEdge } from "./edge-resize.ts";

const box = { x: 10, y: 20, w: 40, h: 30 };

test("правая сторона меняет только ширину", () => {
  assert.deepEqual(resizeByEdge(box, "r", 5, 99), { x: 10, y: 20, w: 45, h: 30 });
});
test("нижняя сторона меняет только высоту", () => {
  assert.deepEqual(resizeByEdge(box, "b", 99, -4), { x: 10, y: 20, w: 40, h: 26 });
});
test("левая сторона: правая граница остаётся на месте", () => {
  const next = resizeByEdge(box, "l", -6, 0);
  assert.deepEqual(next, { x: 4, y: 20, w: 46, h: 30 });
  assert.equal(next.x + next.w, box.x + box.w);
});
test("верхняя сторона: нижняя граница остаётся на месте", () => {
  const next = resizeByEdge(box, "t", 0, 5);
  assert.deepEqual(next, { x: 10, y: 25, w: 40, h: 25 });
  assert.equal(next.y + next.h, box.y + box.h);
});
test("нельзя схлопнуть рамку: есть нижний предел, граница напротив не уезжает", () => {
  const next = resizeByEdge(box, "l", 100, 0);
  assert.equal(next.w, 3);
  assert.equal(next.x + next.w, box.x + box.w);
});
