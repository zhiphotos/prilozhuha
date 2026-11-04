import test from "node:test";
import assert from "node:assert/strict";
import { buildBookPages } from "./full-book.ts";
import { LOVE_BOOK, LOVE_BOOK_PAGES } from "./love-book.ts";
import { WEDDING_EXTRA, WEDDING_EXTRA_PAGES, WEDDING_MODERN, WEDDING_MODERN_PAGES, WEDDING_TRADITIONAL, WEDDING_TRADITIONAL_PAGES } from "./wedding-book.ts";

const textOf = (chapters: typeof LOVE_BOOK) => chapters.flatMap((c) => [c.title, ...c.pages.flatMap((p) => [p.title, p.desc])]).join("\n");

test("«Мемуары любви» подходит любой паре: нет годов, имён и чужих событий", () => {
  assert.equal(LOVE_BOOK_PAGES, 80);
  const all = textOf(LOVE_BOOK);
  assert.ok(!/\b(19|20)\d\d\b/.test(all), "в шаблоне остались годы");
  for (const word of ["Дарин", "студи", "ипотек", "бизнес"]) assert.ok(!all.toLowerCase().includes(word.toLowerCase()), `осталось «${word}»`);
});

test("свадебная книга: традиционная 48 страниц, современная 42, по желанию 10", () => {
  assert.equal(WEDDING_TRADITIONAL_PAGES, 48);
  assert.equal(WEDDING_MODERN_PAGES, 42);
  assert.equal(WEDDING_EXTRA_PAGES, 10);
  assert.deepEqual(WEDDING_TRADITIONAL.map((c) => c.pages.length), [6, 6, 4, 4, 6, 6, 5, 7, 4]);
});

test("традиционная включает русские обряды, современная без них", () => {
  assert.ok(WEDDING_TRADITIONAL.some((c) => c.title === "Русские свадебные традиции"));
  assert.ok(!WEDDING_MODERN.some((c) => /традиц/i.test(c.title)));
  assert.ok(WEDDING_MODERN.some((c) => c.title === "First Look"));
});

test("свадебные страницы – фотокнига: у каждой страницы есть фото-слот, кроме списка, письма и карты", () => {
  for (const [tag, chapters] of [["wedtrad", WEDDING_TRADITIONAL], ["wedmod", WEDDING_MODERN]] as const) {
    const pages = buildBookPages(chapters, tag);
    for (const page of pages) assert.ok(page.blocks.some((b) => b.type === "slot"), `нет фото на странице «${page.title}»`);
  }
});

test("идентификаторы страниц уникальны внутри каждого шаблона и не пересекаются между шаблонами", () => {
  const sets = [
    buildBookPages(LOVE_BOOK, "love"),
    buildBookPages(WEDDING_TRADITIONAL, "wedtrad"),
    buildBookPages(WEDDING_MODERN, "wedmod"),
    buildBookPages(WEDDING_EXTRA, "wedextra"),
  ];
  const all = sets.flatMap((s) => s.map((p) => p.promptId));
  assert.equal(new Set(all).size, all.length);
  for (const s of sets) assert.ok(s.every((p) => p.blocks.length > 0));
});

test("на странице-фотокниге фото занимает основную площадь", () => {
  const pages = buildBookPages(WEDDING_TRADITIONAL, "wedtrad");
  const photoShare = (page: (typeof pages)[number]) => page.blocks.filter((b) => b.type === "slot").reduce((sum, b) => sum + (b.type === "slot" ? (b.w * b.h) / 100 : 0), 0);
  const heavy = pages.filter((p) => photoShare(p) >= 50).length;
  assert.ok(heavy / pages.length >= 0.7, `страниц с фото на 50% и больше: ${heavy} из ${pages.length}`);
});

test("фото-слоты свадебных страниц не вылезают за страницу и не налезают друг на друга", () => {
  for (const [tag, chapters] of [["wedtrad", WEDDING_TRADITIONAL], ["wedmod", WEDDING_MODERN], ["wedextra", WEDDING_EXTRA]] as const) {
    for (const page of buildBookPages(chapters, tag)) {
      const slots = page.blocks.filter((b): b is Extract<typeof b, { type: "slot" }> => b.type === "slot");
      for (const s of slots) assert.ok(s.x >= 0 && s.y >= 0 && s.x + s.w <= 100 && s.y + s.h <= 100, `слот вне страницы: «${page.title}»`);
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) {
          const a = slots[i]!, b = slots[j]!;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          assert.ok(!overlap, `слоты пересекаются: «${page.title}»`);
        }
      }
    }
  }
});
