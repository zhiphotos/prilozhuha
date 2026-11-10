import assert from "node:assert/strict";
import { test } from "node:test";
import { applyReview, defaultDecision, makeChangeSet, reviewChanges, summarize, type Book } from "./helper-changes.ts";

const P = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, relation: "", birthYear: "", maidenName: "", notes: "", ...extra });
const base: Book = { people: [P("a"), P("b", { birthYear: "1950" })], pages: [{ id: "pg1", title: "Страница" }] };

test("diff: новое, правка, удаление", () => {
  const helper: Book = { people: [P("a", { notes: "дополнено" }), P("c")], pages: [{ id: "pg1", title: "Страница" }, { id: "pg2", title: "Новая" }] };
  const ch = makeChangeSet(base, helper);
  assert.deepEqual(ch.map((c) => `${c.key}:${c.kind}:${c.id}`).sort(), ["pages:add:pg2", "people:add:c", "people:edit:a", "people:remove:b"]);
});

test("одновременно: новые люди и страницы просто добавляются", () => {
  const owner: Book = { people: [...(base.people as []), P("x")], pages: base.pages };
  const ch = makeChangeSet(base, { people: [...(base.people as []), P("c")], pages: [...(base.pages as []), { id: "pg2", title: "Новая" }] });
  const items = reviewChanges(owner, ch);
  const out = applyReview(owner, items, {});
  assert.deepEqual((out.people as { id: string }[]).map((p) => p.id), ["a", "b", "x", "c"]);
  assert.equal((out.pages as unknown[]).length, 2);
});

test("правили разные поля одного человека: складываются", () => {
  const owner: Book = { people: [P("a", { birthYear: "1920" }), P("b", { birthYear: "1950" })] };
  const ch = makeChangeSet(base, { people: [P("a", { notes: "от мамы" }), P("b", { birthYear: "1950" })] });
  const [item] = reviewChanges(owner, ch);
  assert.equal(item.state, "clean");
  const out = applyReview(owner, [item], {});
  const a = (out.people as Record<string, unknown>[]).find((p) => p.id === "a")!;
  assert.equal(a.birthYear, "1920");
  assert.equal(a.notes, "от мамы");
});

test("одно поле у обоих: конфликт, по умолчанию остаётся версия владельца", () => {
  const owner: Book = { people: [P("a", { birthYear: "1920" }), P("b", { birthYear: "1950" })] };
  const ch = makeChangeSet(base, { people: [P("a", { birthYear: "1921" }), P("b", { birthYear: "1950" })] });
  const items = reviewChanges(owner, ch);
  assert.equal(items[0].state, "conflict");
  assert.deepEqual(items[0].fields, ["birthYear"]);
  assert.equal(defaultDecision(items[0]), "reject");
  assert.equal(applyReview(owner, items, {}).people, undefined);
  const out = applyReview(owner, items, { "people:a": "theirs" });
  assert.equal((out.people as Record<string, unknown>[])[0].birthYear, "1921");
});

test("конфликт страницы: можно оставить копию рядом", () => {
  const b: Book = { pages: [{ id: "pg1", title: "Страница", x: 1 }] };
  const owner: Book = { pages: [{ id: "pg1", title: "Моя", x: 1 }] };
  const ch = makeChangeSet(b, { pages: [{ id: "pg1", title: "Мамина", x: 1 }] });
  const items = reviewChanges(owner, ch);
  const out = applyReview(owner, items, { "pages:pg1": "copy" }, "от Мамы");
  const pages = out.pages as { id: string; title: string }[];
  assert.equal(pages.length, 2);
  assert.equal(pages[0].title, "Моя");
  assert.equal(pages[1].title, "Мамина (от Мамы)");
  assert.notEqual(pages[1].id, "pg1");
});

test("удаление помощника только предлагается", () => {
  const ch = makeChangeSet(base, { people: [P("a")], pages: base.pages });
  const items = reviewChanges(base, ch);
  assert.equal(items[0].state, "remove");
  assert.equal(applyReview(base, items, {}).people, undefined);
  assert.deepEqual((applyReview(base, items, { "people:b": "accept" }).people as { id: string }[]).map((p) => p.id), ["a"]);
});

test("владелец уже удалил запись, которую помощник правил: возвращается как правка помощника", () => {
  const owner: Book = { people: [P("b", { birthYear: "1950" })] };
  const ch = makeChangeSet(base, { people: [P("a", { notes: "новое" }), P("b", { birthYear: "1950" })] });
  const items = reviewChanges(owner, ch);
  assert.equal(items[0].state, "gone");
  assert.equal(summarize(items).edited, 1);
});

test("повторная отправка тех же правок ничего не дублирует", () => {
  const helper: Book = { people: [...(base.people as []), P("c")] };
  const ch = makeChangeSet(base, helper);
  const first = applyReview(base, reviewChanges(base, ch), {});
  const after: Book = { ...base, ...first };
  const again = reviewChanges(after, ch);
  assert.equal(again[0].state, "already");
  assert.equal(applyReview(after, again, {}).people, undefined);
});
