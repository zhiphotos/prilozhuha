import assert from "node:assert/strict";
import test from "node:test";
import { cropGeom, innerBox } from "./crop.ts";

test("фото на всю высокую страницу: по бокам есть запас, двигать можно и вправо-влево", () => {
  const pageH = 141;
  const inner = innerBox("none", false, 100, 100, pageH);
  assert.equal(Math.round(inner.h), 141);
  // картинка чуть выше, чем шире (1,2): чтобы закрыть рамку 100x141, она шире рамки
  const a = cropGeom(inner, 1.2, { cx: 0.5, cy: 0.5, z: 1 });
  assert.ok(a.dw > inner.w + 10, "ширина картинки больше рамки");
  const left = cropGeom(inner, 1.2, { cx: 0, cy: 0.5, z: 1 });
  const right = cropGeom(inner, 1.2, { cx: 1, cy: 0.5, z: 1 });
  assert.ok(left.cx < 0.5 && right.cx > 0.5, "центр можно сдвинуть в обе стороны");
  assert.ok(a.dh >= inner.h - 0.001, "картинка закрывает рамку по высоте");
});
