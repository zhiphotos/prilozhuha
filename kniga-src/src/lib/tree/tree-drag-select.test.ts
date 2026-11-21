import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Перетаскивание древа мышью в Firefox и Edge не должно выделять текст и тянуть картинки.
const src = readFileSync(new URL("../../components/tree/TreeStage.tsx", import.meta.url), "utf8");

test("поле древа не даёт выделять текст", () => {
  assert.match(src, /tree-viewport absolute inset-0 select-none/);
});
test("встроенное перетаскивание картинок отключено", () => {
  assert.match(src, /onDragStart=\{\(e\) => e\.preventDefault\(\)\}/);
});
test("при нажатии сбрасывается уже начатое выделение", () => {
  assert.match(src, /getSelection\?\.\(\)\?\.removeAllRanges\(\)/);
});
