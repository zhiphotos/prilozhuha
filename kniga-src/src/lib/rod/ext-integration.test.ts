/** С-4б0: настоящее хранилище (useRod), настоящие applyBookData и importBook, DATA_KEYS: чужие ключи не теряются. */
import assert from "node:assert/strict";
import test from "node:test";

const mem = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 };
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", origin: "http://localhost" } };
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

const { useRod } = await import("./store.ts");
const { DATA_KEYS, applyBookData, importBook, bookData } = await import("./backup.ts");
const { ExtOverflowError, EXT_LIMIT } = await import("./ext.ts");
const snapshotData = (state: ReturnType<typeof useRod.getState>) => bookData(state, true);

const reset = () => useRod.setState({ people: [], pages: [], room: null, ext: {} });

test("01 старая копия без ext открывается: ext пустой, остальное как было", async () => {
  reset();
  const file = new File([JSON.stringify({ app: "kniga-roda", version: 1, data: { people: [{ id: "p" }] }, media: {} })], "a.kniga");
  await importBook(file);
  assert.deepEqual(useRod.getState().ext, {});
  assert.equal(useRod.getState().people.length, 1);
});
test("02 импорт копии из будущей версии сохраняет чужие ключи, экспорт отдаёт их обратно", async () => {
  reset();
  const file = new File([JSON.stringify({ app: "kniga-roda", version: 1, data: { people: [], shelf: { a: [1, 2] } }, media: {} })], "a.kniga");
  await importBook(file);
  assert.deepEqual(useRod.getState().ext, { shelf: { a: [1, 2] } });
  assert.deepEqual(bookData(useRod.getState()).shelf, { a: [1, 2] });
});
test("03 синхронизация: applyBookData сохраняет чужие ключи, снимок их отправляет", () => {
  reset();
  applyBookData({ people: [], later: "v2", room: { id: "r", ownerKey: "o", inviteKey: "i" } });
  assert.deepEqual(useRod.getState().ext, { later: "v2" });
  assert.equal("room" in useRod.getState().ext, false);
  assert.equal(snapshotData(useRod.getState()).later, "v2");
});
test("04 room: берётся из облака только если своей нет, в ext не попадает; своя не перезаписывается", () => {
  reset();
  applyBookData({ room: { id: "r1", ownerKey: "o1", inviteKey: "i1", name: "Н" } });
  assert.equal(useRod.getState().room?.id, "r1");
  applyBookData({ room: { id: "r2", ownerKey: "o2", inviteKey: "i2" } });
  assert.equal(useRod.getState().room?.id, "r1");
  assert.deepEqual(useRod.getState().ext, {});
});
test("05 без ext снимок и копия такие же, как были: тот же набор ключей, room только если есть", () => {
  reset();
  assert.deepEqual(Object.keys(snapshotData(useRod.getState())), [...DATA_KEYS]);
  assert.deepEqual(Object.keys(bookData(useRod.getState())), [...DATA_KEYS]);
  useRod.setState({ room: { id: "r", ownerKey: "o", inviteKey: "i", name: "" } });
  assert.deepEqual(Object.keys(snapshotData(useRod.getState())), [...DATA_KEYS, "room"]);
});
test("06 повторное применение не плодит ключей и не растит ext", () => {
  reset();
  for (let n = 0; n < 5; n += 1) applyBookData({ people: [], later: { n: 1 } });
  assert.deepEqual(useRod.getState().ext, { later: { n: 1 } });
});
test("07 огромное чужое значение не раздувает хранилище: отказ, ext не меняется", () => {
  reset();
  assert.throws(() => applyBookData({ people: [], later: "ok", huge: "я".repeat(600_000) }), (error: unknown) => error instanceof ExtOverflowError);
  assert.deepEqual(useRod.getState().ext, {});
});

const HUGE = "я".repeat(EXT_LIMIT);
const before = () => JSON.stringify(useRod.getState(), (_k, v) => (typeof v === "function" ? undefined : v));

test("20 applyBookData при превышении бросает ошибку и ничего не меняет (ни известные ключи, ни ext, ни room)", () => {
  reset();
  useRod.setState({ people: [{ id: "старый" }] as never, ext: { kept: 1 }, room: { id: "r0", ownerKey: "o", inviteKey: "i", name: "" } });
  const snap = before();
  assert.throws(() => applyBookData({ people: [{ id: "новый" }], pages: [{ id: "n" }], room: { id: "r9", ownerKey: "o", inviteKey: "i" }, later: HUGE }), ExtOverflowError);
  assert.equal(before(), snap);
});
test("21 importBook при превышении: ошибка до сохранения фото и до изменения книги", async () => {
  reset();
  useRod.setState({ people: [{ id: "старый" }] as never, ext: { kept: 1 } });
  const snap = before();
  // фото в копии есть: если бы проверка шла после saveMedia, упало бы другой ошибкой (в Node нет IndexedDB) или книга успела бы измениться
  const file = new File([JSON.stringify({ app: "kniga-roda", version: 1, data: { people: [], later: HUGE }, media: { "media:abc": "data:image/png;base64,AAAA" } })], "a.kniga");
  await assert.rejects(importBook(file), (error: unknown) => error instanceof ExtOverflowError);
  assert.equal(before(), snap);
});
test("22 слияние с облаком: свой ext плюс облачный больше лимита: ошибка, книга как была", () => {
  reset();
  const half = "x".repeat(Math.floor(EXT_LIMIT * 0.6));
  useRod.setState({ ext: { a: half } });
  const snap = before();
  assert.throws(() => applyBookData({ people: [], b: half }), ExtOverflowError);
  assert.equal(before(), snap);
});
test("23 замена существующего ключа в облачных данных, не влезающая в лимит: прежнее значение на месте", () => {
  reset();
  useRod.setState({ ext: { later: "старое" } });
  assert.throws(() => applyBookData({ later: HUGE }), ExtOverflowError);
  assert.deepEqual(useRod.getState().ext, { later: "старое" });
});
test("24 известные ключи нельзя подменить через ext: people из ext не перекрывает people из книги", () => {
  reset();
  useRod.setState({ people: [{ id: "реальный" }] as never, ext: { people: "подмена", pages: "подмена" } });
  const out = bookData(useRod.getState());
  assert.deepEqual(out.people, [{ id: "реальный" }]);
  assert.notEqual(out.pages, "подмена");
});
