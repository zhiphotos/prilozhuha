/** С-4б0: объединение книг с особыми именами ключей верхнего уровня: ничего не теряется молча, прототипы не трогаются. */
import assert from "node:assert/strict";
import test from "node:test";
import { mergeBooks } from "./sync-merge.ts";

const P = (id: string, extra: Record<string, unknown> = {}) => ({ id, ...extra });
const parse = (text: string) => JSON.parse(text) as Record<string, unknown>;

test("01 унаследованные имена только в облаке: попадают в результат как обычные ключи", () => {
  const { data } = mergeBooks(parse('{"people":[],"pages":[]}'), parse('{"people":[],"pages":[],"toString":{"a":1},"valueOf":2}'), null);
  assert.deepEqual(JSON.parse(JSON.stringify(data)), { people: [], pages: [], toString: { a: 1 }, valueOf: 2 });
});
test("02 унаследованные имена только здесь: остаются, облачное «унаследованное» не подставляется вместо них", () => {
  const { data } = mergeBooks(parse('{"people":[],"pages":[],"toString":"здесь"}'), parse('{"people":[],"pages":[]}'), null);
  assert.equal(Object.getOwnPropertyDescriptor(data, "toString")?.value, "здесь");
});
test("03 унаследованные имена с обеих сторон: без base остаётся здешнее, с base берётся изменённое", () => {
  const local = '{"people":[],"valueOf":"л"}';
  const cloud = '{"people":[],"valueOf":"о"}';
  assert.equal(Object.getOwnPropertyDescriptor(mergeBooks(parse(local), parse(cloud), null).data, "valueOf")?.value, "л");
  assert.equal(Object.getOwnPropertyDescriptor(mergeBooks(parse('{"people":[],"valueOf":"старое"}'), parse(cloud), parse('{"people":[],"valueOf":"старое"}')).data, "valueOf")?.value, "о");
});
test("04 __proto__, constructor, prototype в облаке: не теряются при объединении, прототип результата не меняется", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const cloud = parse(`{"people":[],"pages":[],${JSON.stringify(key)}:{"x":1}}`);
    const { data } = mergeBooks(parse('{"people":[],"pages":[]}'), cloud, null);
    assert.ok(Object.prototype.hasOwnProperty.call(data, key), key);
    assert.deepEqual(Object.getOwnPropertyDescriptor(data, key)?.value, { x: 1 }, key);
    assert.equal(Object.getPrototypeOf(data), Object.prototype, key);
    assert.equal(({} as Record<string, unknown>).x, undefined, key);
    assert.deepEqual(JSON.parse(JSON.stringify(data)), JSON.parse(JSON.stringify(cloud)), key);
  }
});
test("05 известные списки объединяются как прежде (поведение обычных ключей не изменилось)", () => {
  const { data, report } = mergeBooks({ people: [P("a"), P("b", { n: 1 })] }, { people: [P("b", { n: 1 }), P("c")] }, null);
  assert.deepEqual((data.people as { id: string }[]).map((p) => p.id), ["a", "b", "c"]);
  assert.equal(report.total.added, 1);
});
test("06 списки записей с именами toString, constructor, __proto__: счётчики отчёта считаются числами, прототип отчёта не меняется", () => {
  for (const key of ["toString", "constructor", "__proto__"]) {
    const local = JSON.parse(`{${JSON.stringify(key)}:[{"id":"a","n":1}]}`) as Record<string, unknown>;
    const cloud = JSON.parse(`{${JSON.stringify(key)}:[{"id":"a","n":2},{"id":"b"}]}`) as Record<string, unknown>;
    const { data, report } = mergeBooks(local, cloud, null);
    assert.equal((Object.getOwnPropertyDescriptor(data, key)?.value as { id: string }[]).length, 2, key);
    assert.equal(Object.getOwnPropertyDescriptor(report.added, key)?.value, 1, key);
    assert.equal(report.total.added, 1, key);
    assert.equal(report.total.differing, 1, key);
    assert.equal(Object.getPrototypeOf(report.added), Object.prototype, key);
  }
});
