// Просмотр фото и другие окна поверх страницы должны рисоваться в корне страницы (createPortal в body).
// Иначе окно с fixed внутри карточки с размытием или сдвигом открывается «посреди длинной страницы», и до него надо листать вниз.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const DIRS = ["src/components/rod", "src/components/tree"];
// Файлы, где окно поверх страницы рисуется прямо в разметке по причине, проверенной отдельно (полноэкранные экраны, а не окна поверх карточек).
const ALLOW = new Set<string>([
  "attachments.tsx", // исправлено в PR 252 (просмотр фото через портал); убрать из списка после слияния
]);

test("окна поверх страницы (fixed inset-0 с z от 60 и выше) рисуются через createPortal", () => {
  const bad: string[] = [];
  for (const dir of DIRS) {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".tsx") || ALLOW.has(name)) continue;
      const text = readFileSync(join(dir, name), "utf8");
      const modal = /fixed inset-0 z-\[(6\d|7\d|8\d|9\d)\]/.test(text);
      if (modal && !text.includes("createPortal(")) bad.push(`${dir}/${name}`);
    }
  }
  assert.deepEqual(bad, [], "эти файлы рисуют окно поверх страницы без createPortal: окно может открыться посреди страницы");
});
