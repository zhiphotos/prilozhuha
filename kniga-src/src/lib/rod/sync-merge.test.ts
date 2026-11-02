// Объединение двух версий книги при конфликте синхронизации: ничего не удаляется, при расхождении записи остаётся версия с этого устройства.
import assert from "node:assert/strict";
import test from "node:test";
import { mergeBooks } from "./sync-merge.ts";

const book = (over: Record<string, unknown> = {}) => ({ people: [] as unknown[], pages: [] as unknown[], print: { bleed: 3 }, onboarded: true, ...over });

test("независимые добавления с двух устройств сохраняются все", () => {
  const local = book({ people: [{ id: "a", name: "A" }, { id: "l1", name: "Только у меня" }] });
  const cloud = book({ people: [{ id: "a", name: "A" }, { id: "c1", name: "Только в облаке" }] });
  const { data, report } = mergeBooks(local, cloud);
  assert.deepEqual((data.people as { id: string }[]).map((p) => p.id), ["a", "l1", "c1"]);
  assert.equal(report.added.people, 1);
  assert.equal(report.total.added, 1);
  assert.equal(report.total.differing, 0);
});
test("одна и та же запись изменена на обоих устройствах: остаётся версия с этого устройства, расхождение считается", () => {
  const local = book({ people: [{ id: "a", name: "Моя правка" }] });
  const cloud = book({ people: [{ id: "a", name: "Правка в облаке" }] });
  const { data, report } = mergeBooks(local, cloud);
  assert.equal((data.people as { name: string }[])[0]!.name, "Моя правка");
  assert.equal(report.differing.people, 1);
});
test("страницы, фото и прочие списки с id объединяются так же; настройки берутся с этого устройства", () => {
  const local = book({ pages: [{ id: "p1" }], print: { bleed: 5 }, photos: [{ id: "f1" }] });
  const cloud = book({ pages: [{ id: "p1" }, { id: "p2" }], print: { bleed: 3 }, photos: [{ id: "f2" }], notes: [{ id: "n1" }] });
  const { data, report } = mergeBooks(local, cloud);
  assert.deepEqual((data.pages as { id: string }[]).map((p) => p.id), ["p1", "p2"]);
  assert.deepEqual((data.photos as { id: string }[]).map((p) => p.id), ["f1", "f2"]);
  assert.deepEqual((data.notes as { id: string }[]).map((p) => p.id), ["n1"]);
  assert.deepEqual(data.print, { bleed: 5 });
  assert.equal(report.total.added, 3);
});
test("ничего не теряется: все id с обеих сторон есть в результате, исходные данные не изменены", () => {
  const local = book({ people: [{ id: "x1" }, { id: "x2" }] });
  const cloud = book({ people: [{ id: "x2" }, { id: "x3" }] });
  const snapshot = JSON.stringify([local, cloud]);
  const { data } = mergeBooks(local, cloud);
  const ids = new Set((data.people as { id: string }[]).map((p) => p.id));
  for (const id of ["x1", "x2", "x3"]) assert.ok(ids.has(id));
  assert.equal(JSON.stringify([local, cloud]), snapshot);
});
test("значения, которые не являются списками записей с id, не объединяются и не ломаются", () => {
  const local = book({ plan: { a: 1 }, fonts: ["x", "y"] });
  const cloud = book({ plan: { b: 2 }, fonts: ["z"], extra: "из облака" });
  const { data } = mergeBooks(local, cloud);
  assert.deepEqual(data.plan, { a: 1 });
  assert.deepEqual(data.fonts, ["x", "y"]);
  assert.equal(data.extra, "из облака");
});
