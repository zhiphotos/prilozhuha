/** С-3г, исправление: владелец изменил запись после получения предложения, потом нажал «Принять». */
import assert from "node:assert/strict";
import test from "node:test";
import { applyReviewChecked, makeChangeSet, reviewChanges, type Book, type Decision, type Rec } from "./helper-changes.ts";

const P = (id: string, extra: Record<string, unknown> = {}): Rec => ({ id, name: id, relation: "", birthYear: "1950", ...extra });
const book = (people: Rec[]): Book => ({ people, places: [], stories: [], notes: [], pages: [], photos: [] });
const person = (b: Book, id: string) => (b.people as Rec[]).find((r) => r.id === id);
const apply = (owner: Book, patch: Partial<Record<string, Rec[]>>): Book => ({ ...owner, ...patch });

// помощник получил base, поменял поля; владелец сначала видит предложение по `shown`, потом книга становится `later`
const setup = (base: Rec, helper: Rec, shown: Rec, later: Rec) => {
  const changes = makeChangeSet(book([base]), book([helper]));
  const items = reviewChanges(book([shown]), changes);
  return { changes, items, later: book([later]) };
};

test("Л1 то же поле: было чисто, владелец изменил, нажал «Принять»: не молча, а спор с обеими версиями, запись не тронута", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951" }, base, { ...base, birthYear: "1970" });
  assert.equal(s.items[0].state, "clean");
  const { patch, stale } = applyReviewChecked(s.later, s.changes, s.items, {}, "от Мамы");
  assert.equal(patch.people, undefined);
  assert.equal(person(s.later, "a")!.birthYear, "1970");
  assert.equal(stale.length, 1);
  assert.equal(stale[0].state, "conflict");
  assert.equal(stale[0].changedSince, true);
  assert.deepEqual(stale[0].fields, ["birthYear"]);
  const f = stale[0].merge!.fields[0];
  assert.equal(f.ours, "1970");
  assert.equal(f.theirs, "1951");
});

test("Л2 после показа спора владелец выбирает: версия помощника, оставить своё, копией", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951" }, base, { ...base, birthYear: "1970" });
  const { stale } = applyReviewChecked(s.later, s.changes, s.items, {});
  const key = "people:a";
  const go = (d: Decision) => apply(s.later, applyReviewChecked(s.later, s.changes, stale, { [key]: d }).patch);
  assert.equal(person(go("theirs"), "a")!.birthYear, "1951");
  assert.equal(person(go("mine"), "a")!.birthYear, "1970");
  const copy = go("copy");
  assert.equal((copy.people as Rec[]).length, 2);
  assert.equal(person(copy, "a")!.birthYear, "1970");
  assert.ok((copy.people as Rec[]).some((r) => r.id !== "a" && r.birthYear === "1951"));
});

test("Л3 «Принять» после позднего изменения другого поля: спора нет, правка помощника добавляется, правка владельца цела", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951" }, base, { ...base, relation: "мама" });
  const { patch, stale } = applyReviewChecked(s.later, s.changes, s.items, {});
  assert.equal(stale.length, 0);
  const r = person(apply(s.later, patch), "a")!;
  assert.equal(r.birthYear, "1951");
  assert.equal(r.relation, "мама");
});

test("Л4 два поля: одно позднее у обоих, другое только у помощника: чистая правка не теряется, спорное возвращается", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951", relation: "бабушка" }, base, { ...base, birthYear: "1970" });
  const { patch, stale } = applyReviewChecked(s.later, s.changes, s.items, {});
  assert.equal(stale.length, 1);
  assert.deepEqual(stale[0].fields, ["birthYear"]);
  assert.deepEqual(stale[0].touched.sort(), ["birthYear", "relation"]);
  // при выборе «Оставить моё» неспорное «бабушка» добавится, спорное останется 1970
  const keep = person(apply(s.later, applyReviewChecked(s.later, s.changes, stale, { "people:a": "mine" }).patch), "a")!;
  assert.equal(keep.birthYear, "1970");
  assert.equal(keep.relation, "бабушка");
  const take = person(apply(s.later, applyReviewChecked(s.later, s.changes, stale, { "people:a": "theirs" }).patch), "a")!;
  assert.equal(take.birthYear, "1951");
  assert.equal(take.relation, "бабушка");
  void patch;
});

test("Л5 уже был спор, владелец выбрал «версия помощника» по старому виду, а потом поменял поле: решение не применяется молча", () => {
  const base = P("a");
  const shown = { ...base, name: "Вера" };
  const s = setup(base, { ...base, name: "Верочка", birthYear: "1951" }, shown, { ...shown, name: "Вера Ивановна" });
  assert.equal(s.items[0].state, "conflict");
  const { stale } = applyReviewChecked(s.later, s.changes, s.items, { "people:a": "theirs" });
  assert.equal(stale.length, 1);
  assert.equal(stale[0].merge!.fields[0].ours, "Вера Ивановна");
});

test("Л6 «Оставить моё» и «копией» после позднего изменения применяются сразу, без возврата", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951" }, base, { ...base, birthYear: "1970" });
  assert.equal(applyReviewChecked(s.later, s.changes, s.items, { "people:a": "mine" }).stale.length, 0);
  assert.equal(applyReviewChecked(s.later, s.changes, s.items, { "people:a": "copy" }).stale.length, 0);
});

test("Л7 запись без позднего изменения: поведение прежнее (stale пуст, принято)", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951" }, base, base);
  const { patch, stale } = applyReviewChecked(s.later, s.changes, s.items, {});
  assert.equal(stale.length, 0);
  assert.equal(person(apply(s.later, patch), "a")!.birthYear, "1951");
});

test("Л8 владелец поздно сам принял то же значение: предложение исчезает честно (уже совпало), без спора", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951" }, base, { ...base, birthYear: "1951" });
  const { patch, stale } = applyReviewChecked(s.later, s.changes, s.items, {});
  assert.equal(stale.length, 0);
  assert.equal(patch.people, undefined);
});

test("Л9 повторная выдача после сбоя подтверждения: нет дубликатов записей и копий, спор показывается один раз на запись", () => {
  const base = P("a");
  const s = setup(base, { ...base, birthYear: "1951" }, base, { ...base, birthYear: "1970" });
  const once = applyReviewChecked(s.later, s.changes, s.items, {});
  const twice = applyReviewChecked(s.later, s.changes, reviewChanges(s.later, s.changes), {}); // то же предложение пришло снова
  assert.equal(once.stale.length, 1);
  assert.equal(twice.stale.length, 0); // свежий разбор уже спор, без позднего изменения: обычная карточка
  assert.equal(reviewChanges(s.later, s.changes).filter((i) => i.state === "conflict").length, 1);
  // «Копией» дважды: одна копия
  const c1 = apply(s.later, applyReviewChecked(s.later, s.changes, once.stale, { "people:a": "copy" }).patch);
  const c2 = apply(c1, applyReviewChecked(c1, s.changes, reviewChanges(c1, s.changes), { "people:a": "copy" }).patch);
  assert.equal((c2.people as Rec[]).length, 2);
  // «Версия помощника» дважды: запись одна
  const t1 = apply(s.later, applyReviewChecked(s.later, s.changes, once.stale, { "people:a": "theirs" }).patch);
  const t2 = apply(t1, applyReviewChecked(t1, s.changes, reviewChanges(t1, s.changes), { "people:a": "theirs" }).patch);
  assert.equal((t2.people as Rec[]).length, 1);
  assert.equal(person(t2, "a")!.birthYear, "1951");
});

test("Л10 несколько записей: поздно изменённая возвращается, остальные применяются", () => {
  const base = [P("a"), P("b")];
  const changes = makeChangeSet(book(base), book([{ ...base[0], birthYear: "1951" }, { ...base[1], birthYear: "1952" }]));
  const items = reviewChanges(book(base), changes);
  const later = book([{ ...base[0], birthYear: "1970" }, base[1]]);
  const { patch, stale } = applyReviewChecked(later, changes, items, {});
  assert.deepEqual(stale.map((i) => i.id), ["a"]);
  assert.equal(person(apply(later, patch), "b")!.birthYear, "1952");
  assert.equal(person(apply(later, patch), "a")!.birthYear, "1970");
});
