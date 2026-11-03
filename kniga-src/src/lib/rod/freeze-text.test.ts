import assert from "node:assert/strict";
import test from "node:test";
import { freezeTextSizes, pinnedPx } from "./freeze-text.ts";
import { FONT_FAMILY, FONT_WEIGHT, textMetrics } from "./page-style.ts";
import type { BookPage, PageBlock } from "./types.ts";

const text = (id: string, font: "serif" | "sans" | "script", size: "sm" | "md" | "lg" | "xl", px?: number): PageBlock => ({ id, type: "text", x: 10, y: 10, w: 80, text: "Название", font, size, ...(px ? { px } : {}) }) as PageBlock;
const page = (blocks: PageBlock[]): BookPage => ({ id: "p", title: "", kind: "page", paper: "cream", strokes: [], blocks }) as BookPage;

test("закрепление не меняет вид: размер после закрепления равен размеру по таблице, для любого шрифта", () => {
  for (const font of ["serif", "sans", "script"] as const) {
    for (const size of ["sm", "md", "lg", "xl"] as const) {
      const before = textMetrics(font, size).size;
      const after = textMetrics(font, size, pinnedPx({ font, size })).size;
      assert.ok(Math.abs(before - after) < 0.01, `${font}/${size}: ${before} != ${after}`);
    }
  }
});

test("тексты без px получают px, тексты с px и другие блоки не трогаются", () => {
  const book = [page([text("a", "script", "xl"), text("b", "sans", "sm", 33), { id: "s", type: "sticker", x: 1, y: 1, kind: "heart" } as PageBlock])];
  const out = freezeTextSizes(book);
  const [a, b, s] = out[0].blocks as Array<{ px?: number }>;
  assert.equal(a.px, pinnedPx({ font: "script", size: "xl" }));
  assert.equal(b.px, 33);
  assert.equal("px" in s, false);
});

test("повторное закрепление ничего не меняет и возвращает тот же массив", () => {
  const once = freezeTextSizes([page([text("a", "serif", "lg")])]);
  assert.equal(freezeTextSizes(once), once);
});

test("регрессия: закреплённый заголовок не меняет размер, даже если таблица размеров в обновлении станет другой", () => {
  const frozen = freezeTextSizes([page([text("title", "script", "xl")])]);
  const px = (frozen[0].blocks[0] as { px: number }).px;
  // Обновление поменяло бы таблицу SIZE: текст без px поехал бы, а с px размер определяется только px.
  const sizeNow = textMetrics("script", "xl", px).size;
  assert.equal(sizeNow, (px / 1000) * 100);
});

test("таблицы шрифтов и размеров зафиксированы: менять их можно только осознанно (сначала перенесите старые книги)", () => {
  // Если этот тест упал, вы поменяли вид уже сделанных книг. Новые значения заводите отдельным видом шрифта, а не правкой старого.
  assert.deepEqual(
    (["serif", "sans", "script"] as const).map((f) => ["sm", "md", "lg", "xl"].map((s) => textMetrics(f, s as "sm").size).concat(textMetrics(f, "md").leading)),
    [[1.85, 2.4, 4.2, 7.5, 1.3], [2, 2.6, 4, 7, 1.4], [2.8, 3.8, 6.2, 10, 1.15]],
  );
  assert.deepEqual(FONT_WEIGHT, { serif: 600, sans: 600, script: 400 });
  assert.match(FONT_FAMILY.script, /kr-babushka/);
  assert.match(FONT_FAMILY.serif, /Manrope/);
  assert.match(FONT_FAMILY.sans, /Manrope/);
});
