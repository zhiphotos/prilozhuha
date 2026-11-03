import assert from "node:assert/strict";
import test from "node:test";
import { applyEdge, edgesFor } from "./edge-handles.ts";

test("стороны есть у фото, фигур и рамок, у текста и стикера только боковые", () => {
  assert.deepEqual(edgesFor({ type: "photo" }), ["l", "r", "t", "b"]);
  assert.deepEqual(edgesFor({ type: "shape" }), ["l", "r", "t", "b"]);
  assert.deepEqual(edgesFor({ type: "text" }), ["l", "r"]);
  assert.deepEqual(edgesFor({ type: "sticker" }), ["l", "r"]);
  assert.deepEqual(edgesFor({ type: "ink" }), []);
});

test("повёрнутый блок тянется только углом", () => {
  assert.deepEqual(edgesFor({ type: "photo", rotate: 30 }), []);
  assert.deepEqual(edgesFor({ type: "photo", rotate: 1 }), ["l", "r", "t", "b"]);
});

test("правая сторона меняет только ширину, левая сдвигает рамку и держит правый край", () => {
  const box = { x: 10, y: 20, w: 40, h: 30 };
  assert.deepEqual(applyEdge(box, "r", 5, 9), { x: 10, y: 20, w: 45, h: 30 });
  const left = applyEdge(box, "l", 5, 9);
  assert.equal(left.x + left.w, 50);
  assert.equal(left.w, 35);
});

test("у текста без высоты работает только ширина; верх и низ игнорируются", () => {
  const box = { x: 10, y: 20, w: 40, h: null };
  assert.deepEqual(applyEdge(box, "r", 5, 9), { x: 10, y: 20, w: 45, h: null });
  assert.deepEqual(applyEdge(box, "b", 5, 9), box);
});
