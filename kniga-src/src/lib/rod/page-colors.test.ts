import assert from "node:assert/strict";
import test from "node:test";
import { previewRecolor, recolorPages, revertRecolor } from "./page-colors.ts";
import type { BookPage } from "./types.ts";

const text = (id: string, color?: string) => ({ id, type: "text", x: 0, y: 0, w: 50, text: "т", font: { kind: "preset", id: "a" }, size: "md", color }) as unknown as BookPage["blocks"][number];
const photo = (id: string) => ({ id, type: "photo", x: 0, y: 0, w: 10 }) as unknown as BookPage["blocks"][number];
const page = (id: string, kind: "cover" | "page", bg: string | undefined, blocks: BookPage["blocks"]): BookPage => ({ id, kind, title: id, paper: "plain", strokes: [], blocks, bg }) as unknown as BookPage;
const book = () => [page("c", "cover", undefined, [text("ct")]), page("p1", "page", undefined, [text("a"), photo("f")]), page("p2", "page", "#112233", [text("b", "#ff0000"), text("c")]), page("p3", "page", undefined, [])];
const O = { bg: "#eeeeee", text: "#222222", keepCustom: true, includeCover: false };

test("по умолчанию свои цвета и обложка не затираются", () => {
  const r = recolorPages(book(), O);
  assert.deepEqual(r.pages.map((p) => p.bg), [undefined, "#eeeeee", "#112233", "#eeeeee"]);
  assert.equal((r.pages[2]!.blocks[0] as { color?: string }).color, "#ff0000");
  assert.equal((r.pages[2]!.blocks[1] as { color?: string }).color, "#222222");
  assert.equal((r.pages[0]!.blocks[0] as { color?: string }).color, undefined);
  assert.deepEqual([r.pageCount, r.textCount], [2, 2]);
});

test("явный выбор: затереть свои цвета и красить обложку", () => {
  const r = recolorPages(book(), { ...O, keepCustom: false, includeCover: true });
  assert.ok(r.pages.every((p) => p.bg === "#eeeeee"));
  assert.equal((r.pages[2]!.blocks[0] as { color?: string }).color, "#222222");
  assert.equal((r.pages[0]!.blocks[0] as { color?: string }).color, "#222222");
});

test("предпросмотр считает то же, что применение", () => {
  const p = previewRecolor(book(), O);
  const r = recolorPages(book(), O);
  assert.deepEqual(p, { pageCount: r.pageCount, textCount: r.textCount });
});

test("одна отмена возвращает прежние цвета, а правки после операции остаются", () => {
  const before = book();
  const r = recolorPages(before, { ...O, keepCustom: false });
  const edited = r.pages.map((p) => (p.id === "p1" ? { ...p, title: "новое имя" } : p));
  const back = revertRecolor(edited, r.undo);
  assert.deepEqual(back.map((p) => p.bg), before.map((p) => p.bg));
  assert.equal((back[2]!.blocks[0] as { color?: string }).color, "#ff0000");
  assert.equal((back[1]!.blocks[0] as { color?: string }).color, undefined);
  assert.equal(back[1]!.title, "новое имя");
});

test("повтор того же цвета ничего не меняет", () => {
  const first = recolorPages(book(), O);
  const again = recolorPages(first.pages, O);
  assert.deepEqual([again.pageCount, again.textCount], [0, 0]);
});

test("без выбранных цветов ничего не делает", () => {
  const r = recolorPages(book(), { keepCustom: true, includeCover: false });
  assert.deepEqual([r.pageCount, r.textCount], [0, 0]);
});
