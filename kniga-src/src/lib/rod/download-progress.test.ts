import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadProgress } from "./download-progress.ts";

test("проценты скачивания не падают, когда начинается следующий файл", () => {
  const shown: number[] = [];
  const update = downloadProgress((p) => String(p), (label) => shown.push(Number(label)));
  update({ status: "progress", file: "a", loaded: 50, total: 100 });
  update({ status: "progress", file: "a", loaded: 100, total: 100 });
  update({ status: "progress", file: "b", loaded: 5, total: 900 });
  update({ status: "progress", file: "b", loaded: 450, total: 900 });
  update({ status: "progress", file: "b", loaded: 900, total: 900 });
  for (let i = 1; i < shown.length; i += 1) assert.ok(shown[i] >= shown[i - 1], `число упало: ${shown.join(", ")}`);
  assert.ok(shown[shown.length - 1] >= 90);
});

test("статусы кроме progress игнорируются", () => {
  const shown: string[] = [];
  downloadProgress((p) => String(p), (l) => shown.push(l))({ status: "initiate" });
  assert.equal(shown.length, 0);
});
