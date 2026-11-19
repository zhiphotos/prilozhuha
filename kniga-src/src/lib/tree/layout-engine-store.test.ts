// Этап 4.1: переключатель движка живёт только на устройстве, по умолчанию classic, в данные книги ничего не пишет.
import assert from "node:assert/strict";
import test from "node:test";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};
const g = globalThis as unknown as Record<string, unknown>;
const win = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", search: "", hash: "" }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
g.window = win;
g.location = win.location;
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

const { useRod } = await import("../rod/store.ts");
const KEY = "kniga-tree-ui";
/** Свежий экземпляр хранилища (в строке запроса другое имя модуля), чтобы проверять чтение настроек при открытии. */
const load = (q: string) => import(`./ui-store.ts?${q}`) as Promise<typeof import("./ui-store.ts")>;

test("по умолчанию engine = classic; переключение сохраняется только в настройках устройства", async () => {
  const { useTree } = await load("default");
  assert.equal(useTree.getState().engine, "classic");
  const peopleBefore = JSON.stringify(useRod.getState().people);
  useTree.getState().setEngine("family");
  assert.equal(useTree.getState().engine, "family");
  assert.equal(JSON.parse(mem.get(KEY)!).engine, "family");
  assert.equal(JSON.stringify(useRod.getState().people), peopleBefore, "данные книги не тронуты");
  useTree.getState().setEngine("classic");
  assert.equal(JSON.parse(mem.get(KEY)!).engine, "classic");
});

test("сохранённый family читается при следующем открытии; мусорное значение даёт classic", async () => {
  mem.set(KEY, JSON.stringify({ engine: "family" }));
  const a = await load("saved");
  assert.equal(a.useTree.getState().engine, "family");
  mem.set(KEY, JSON.stringify({ engine: "что-то" }));
  const b = await load("junk");
  assert.equal(b.useTree.getState().engine, "classic");
});

test("адрес ?layout=family включает движок на сессию и на устройстве не сохраняется", async () => {
  mem.set(KEY, JSON.stringify({ engine: "classic" }));
  win.location.search = "?layout=family";
  const { useTree } = await load("url");
  assert.equal(useTree.getState().engine, "family");
  useTree.getState().setFlow("up"); // любое другое сохранение настроек
  assert.equal(JSON.parse(mem.get(KEY)!).engine, "classic", "параметр адреса попал в сохранённые настройки");
  win.location.search = "";
});
