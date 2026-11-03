import test from "node:test";
import assert from "node:assert/strict";
import { FULL_BOOK, FULL_BOOK_PAGES, buildBookPages } from "./full-book.ts";

test("полный шаблон: восемь частей, 99 страниц после обложки (вместе с ней 100)", () => {
  assert.equal(FULL_BOOK.length, 8);
  assert.equal(FULL_BOOK_PAGES, 99);
  assert.deepEqual(FULL_BOOK.map((c) => c.pages.reduce((n, p) => n + p.kinds.length, 0)), [11, 10, 18, 12, 14, 12, 12, 10]);
});
test("части идут по порядку и называются как в структуре", () => {
  assert.deepEqual(FULL_BOOK.map((c) => c.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(FULL_BOOK[0]!.title, "Начало семейной истории");
  assert.equal(FULL_BOOK[7]!.title, "Наследие нашей семьи");
});
test("названия страниц в части не повторяются (иначе совпадут идентификаторы страниц)", () => {
  for (const c of FULL_BOOK) {
    const titles = c.pages.map((p) => p.title);
    assert.equal(new Set(titles).size, titles.length, `в части ${c.n} есть повторы`);
  }
});
test("собранные страницы: 99 штук, у каждой уникальный идентификатор и есть подсказка", () => {
  const pages = buildBookPages(FULL_BOOK, "full");
  assert.equal(pages.length, 99);
  assert.equal(new Set(pages.map((p) => p.promptId)).size, 99);
  assert.ok(pages.every((p) => p.blocks.length > 0));
});
