import assert from "node:assert/strict";
import test from "node:test";
import { LAYOUT_COUNTS, PHOTO_LAYOUTS, layoutSlots } from "./photo-layouts.ts";

test("макеты: рамки внутри страницы и не налезают друг на друга (кроме наклонных)", () => {
  for (const l of PHOTO_LAYOUTS) {
    assert.equal(l.rects.length, l.n, l.id);
    for (const r of l.rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 100.01 && r.y + r.h <= 100.01 && r.w > 5 && r.h > 5, l.id);
    }
    if (l.rects.every((r) => !r.rotate && !r.shape)) {
      for (const [i, a] of l.rects.entries()) for (const b of l.rects.slice(i + 1)) {
        const overlap = a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
        assert.ok(!overlap, `${l.id} пересечение`);
      }
    }
  }
  assert.deepEqual(LAYOUT_COUNTS, [1, 2, 3, 4, 5, 6, 9]);
  for (const l of PHOTO_LAYOUTS) for (const t of l.texts ?? []) assert.ok(t.x >= 0 && t.x + t.w <= 100 && t.y >= 0 && t.y < 96, `${l.id} текст`);
  assert.equal(layoutSlots(PHOTO_LAYOUTS[2]!, () => "x").length, 2);
});
