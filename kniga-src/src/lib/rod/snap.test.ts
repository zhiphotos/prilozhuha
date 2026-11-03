import assert from "node:assert/strict";
import test from "node:test";
import { snapBox } from "./snap.ts";

const page = { w: 100, h: 140 };

test("центр блока прилипает к центру страницы и показывает направляющую", () => {
  const r = snapBox({ x: 29.5, y: 10, w: 40, h: 10 }, [], page);
  assert.equal(r.x, 30);
  assert.deepEqual(r.guides.v, [50]);
});

test("левый край прилипает к левому краю другого блока", () => {
  const r = snapBox({ x: 20.8, y: 60, w: 30, h: 10 }, [{ x: 20, y: 5, w: 50, h: 10 }], page);
  assert.equal(r.x, 20);
  assert.deepEqual(r.guides.v, [20]);
});

test("далеко от линий ничего не двигается", () => {
  const r = snapBox({ x: 12, y: 33, w: 20, h: 10 }, [{ x: 70, y: 100, w: 10, h: 10 }], page);
  assert.deepEqual([r.x, r.y, r.guides.v, r.guides.h], [12, 33, [], []]);
});

test("по вертикали прилипает к центру другого блока", () => {
  const r = snapBox({ x: 5, y: 44.4, w: 20, h: 10 }, [{ x: 60, y: 20, w: 20, h: 50 }], page);
  assert.equal(r.guides.h.length, 1);
  assert.ok(Math.abs(r.y + 5 - 45) < 1e-9 || Math.abs(r.y - 45) < 1e-9 || Math.abs(r.y + 10 - 45) < 1e-9);
});

test("первый текст страницы выигрывает при равном расстоянии", () => {
  const r = snapBox({ x: 20.5, y: 0, w: 10, h: 5 }, [{ x: 19.5, y: 100, w: 5, h: 5 }, { x: 21.5, y: 100, w: 5, h: 5, first: true }], page, 1.2);
  assert.equal(r.guides.v[0], 21.5);
});
