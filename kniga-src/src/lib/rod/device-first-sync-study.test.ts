/**
 * С-4а, дополнение: первая синхронизация с локальными данными, фиксированные id и сохранность неизвестных данных (основа для «читателя»).
 * Кандидат слияния лежит в device-merge-candidate.fixture.ts и приложением не используется. Рабочее поведение не меняется.
 */
process.env.MEMORY_STORE = "1";
process.env.APP_ORIGINS = "https://app.example";
process.env.ACCESS_SECRET = "s".repeat(40);

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mem = new Map<string, string>();
const g = globalThis as unknown as Record<string, unknown>;
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k), clear: () => mem.clear(), key: () => null, length: 0 };
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", origin: "http://localhost" } };
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

const { useRod } = await import("./store.ts");
const { applyBookData } = await import("./backup.ts");
const { candidateMerge } = await import("./device-merge-candidate.fixture.ts");
const { mergeBooks } = await import("./sync-merge.ts");
type Rec = { id: string } & Record<string, unknown>;

const initial = useRod.getInitialState() as unknown as Record<string, unknown>;
const DEFAULTS: Record<string, unknown> = { back: initial.back, spine: initial.spine, fonts: initial.fonts, userStickers: initial.userStickers, plan: initial.plan, print: initial.print, moodboard: initial.moodboard, doneLessons: initial.doneLessons, audience: initial.audience, dedicatee: initial.dedicatee, collector: initial.collector, onboarded: initial.onboarded };
const people = (n: number, prefix = "p"): Rec[] => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}` }));
const book = (extra: Record<string, unknown> = {}) => ({ ...DEFAULTS, people: [] as Rec[], pages: [] as Rec[], ...extra });

// ——— 1. Фиксированные id
test("ID1 в сохраняемых списках фиксированных id нет: «me» и «self» встречаются только в демо-дереве и подписях, добавление записей идёт через uid()", () => {
  const store = readFileSync(new URL("./store.ts", import.meta.url), "utf8");
  for (const fn of ["addPerson", "addPlace", "addEvent", "addDocument"]) assert.match(store, new RegExp(`${fn}: \\(input\\) =>[\\s\\S]{0,160}uid\\(\\)`));
  assert.match(store, /function uid\(\): string \{\s*return crypto\.randomUUID\(\);/);
  const demo = readFileSync(new URL("../tree/demo.ts", import.meta.url), "utf8");
  assert.match(demo, /export function blankTree/);
  assert.equal(/blankTree\(/.test(readFileSync(new URL("../../components/rod/ged-import.tsx", import.meta.url), "utf8")), false, "blankTree в книгу не попадает");
});
test("ID2 единственные фиксированные id: задняя сторона «__back__» (один объект в ключе back, не список) и показные «cover»/«c» (в книгу не записываются)", () => {
  const types = readFileSync(new URL("./types.ts", import.meta.url), "utf8");
  assert.match(types, /BACK_ID = "__back__"/);
  const bookTsx = readFileSync(new URL("../../components/rod/book.tsx", import.meta.url), "utf8");
  assert.match(bookTsx, /placePage\(addPage\(coverPage\(meta\)\), 0\)/, "обложка создаётся через addPage с uid()");
});

// ——— 2. Первая синхронизация
test("П1 пустое новое устройство получает облачную книгу целиком, без слияния и без конфликтов", () => {
  const cloud = book({ people: people(30), spine: { text: "Наша семья", font: "script", size: 2 }, fonts: ["Yauza"] });
  const r = candidateMerge(book(), cloud, null, DEFAULTS, true);
  assert.equal(r.mode, "empty-device");
  assert.deepEqual(r.data, cloud);
  assert.equal(r.conflicts.length, 0);
});
test("П2 локальные данные, базы нет, разные id: записи объединяются без единого конфликта (старый mergeBooks даёт то же по записям)", () => {
  const local = book({ people: people(5, "l") });
  const cloud = book({ people: people(200, "c") });
  const r = candidateMerge(local, cloud, null, DEFAULTS, false);
  assert.equal(r.conflicts.length, 0);
  assert.equal((r.data.people as Rec[]).length, 205);
  assert.equal((mergeBooks(local, cloud, null).data.people as Rec[]).length, 205);
});
test("П3 одинаковый id и одинаковое содержимое: конфликта нет", () => {
  const r = candidateMerge(book({ people: [{ id: "x", name: "A" }] }), book({ people: [{ id: "x", name: "A" }] }), null, DEFAULTS, false);
  assert.equal(r.conflicts.length, 0);
  assert.equal((r.data.people as Rec[]).length, 1);
});
test("П4 одинаковый id, разное содержимое, базы нет: конфликт только по этой записи, остальные 199 не затронуты, обе версии сохранены", () => {
  const same = people(199);
  const local = book({ people: [...same, { id: "dup", name: "Здесь" }] });
  const cloud = book({ people: [...same, { id: "dup", name: "В облаке" }] });
  const r = candidateMerge(local, cloud, null, DEFAULTS, false);
  assert.equal(r.conflicts.length, 1);
  assert.deepEqual(r.conflicts[0], { key: "people", id: "dup", kind: "add-add", ours: { id: "dup", name: "Здесь" }, theirs: { id: "dup", name: "В облаке" } });
  assert.equal((r.data.people as Rec[]).length, 200);
  // старый алгоритм здесь молча оставляет здешнюю, облачная версия остаётся только в резервной копии
  assert.equal(((mergeBooks(local, cloud, null).data.people as Rec[]).find((p) => p.id === "dup") as Rec).name, "Здесь");
});
test("П5 одинаковые фиксированные id (воображаемый «me» на обоих устройствах): конфликт только по «me», остальная книга объединяется, отсутствие базы не даёт конфликт на всю книгу", () => {
  const local = book({ people: [{ id: "me", name: "Роман" }, ...people(20, "l")] });
  const cloud = book({ people: [{ id: "me", name: "Р." }, ...people(300, "c")] });
  const r = candidateMerge(local, cloud, null, DEFAULTS, false);
  assert.deepEqual(r.conflicts.map((c) => `${c.key}:${c.id}:${c.kind}`), ["people:me:add-add"]);
  assert.equal((r.data.people as Rec[]).length, 321);
});
test("П6 настройки: облачное значение берётся, если локальное точно равно умолчанию; разные непустые дают конфликт; пустое облако не затирает заполненное локальное", () => {
  const filled = { text: "Наша семья", font: "script", size: 2 };
  const other = { text: "Мы", font: "sans", size: 1 };
  const a = candidateMerge(book({ people: people(1) }), book({ spine: filled, fonts: ["Yauza"] }), null, DEFAULTS, false);
  assert.deepEqual(a.data.spine, filled);
  assert.deepEqual(a.data.fonts, ["Yauza"]);
  assert.equal(a.conflicts.length, 0);
  const b = candidateMerge(book({ spine: filled, people: people(1) }), book({ spine: other }), null, DEFAULTS, false);
  assert.deepEqual(b.conflicts.map((c) => c.kind), ["setting"]);
  assert.deepEqual(b.data.spine, filled, "здешнее остаётся, облачное сохранено в конфликте");
  const c = candidateMerge(book({ spine: filled, people: people(1) }), book({}), null, DEFAULTS, false);
  assert.deepEqual(c.data.spine, filled);
  assert.equal(c.conflicts.length, 0);
});
test("П7 обложка: на новом устройстве книга сама создаёт свою обложку со случайным id, после объединения обложек две (особый случай: единственная страница)", () => {
  const local = book({ pages: [{ id: "cov-local", kind: "cover", title: "Обложка" }], people: people(1) });
  const cloud = book({ pages: [{ id: "cov-cloud", kind: "cover", title: "Обложка" }] });
  const r = candidateMerge(local, cloud, null, DEFAULTS, false);
  assert.equal(r.conflicts.length, 0, "по правилу «запись только с одной стороны не теряется» конфликта нет");
  assert.equal((r.data.pages as Rec[]).filter((p) => p.kind === "cover").length, 2, "но обложек две: нужно решение, как слияние это узнаёт");
});
test("П8 editedAt не определяет победителя и не создаёт конфликт: при чистом слиянии берётся максимум", () => {
  const base = book({ pages: [{ id: "g", title: "T", blocks: ["a"], editedAt: 1 }] });
  const local = book({ pages: [{ id: "g", title: "T2", blocks: ["a"], editedAt: 5 }] });
  const cloud = book({ pages: [{ id: "g", title: "T", blocks: ["a", "b"], editedAt: 9 }] });
  const r = candidateMerge(local, cloud, base, DEFAULTS, false);
  assert.equal(r.conflicts.length, 0);
  assert.deepEqual(r.data.pages, [{ id: "g", title: "T2", blocks: ["a", "b"], editedAt: 9 }]);
});
test("П9 массовое удаление: 21 запись или больше половины книги ждут подтверждения и не применяются", () => {
  const baseP = people(100);
  const base = book({ people: baseP });
  const keepAll = book({ people: baseP });
  const del21 = book({ people: baseP.slice(21) });
  const r1 = candidateMerge(keepAll, del21, base, DEFAULTS, false); // облако удалило 21
  assert.equal(r1.needsConfirm, true);
  assert.equal((r1.data.people as Rec[]).length, 100, "до подтверждения ничего не удалено");
  const del20 = book({ people: baseP.slice(20) });
  const r2 = candidateMerge(keepAll, del20, base, DEFAULTS, false);
  assert.equal(r2.needsConfirm, false);
  assert.equal((r2.data.people as Rec[]).length, 80);
  const small = people(10);
  const r3 = candidateMerge(book({ people: small }), book({ people: small.slice(6) }), book({ people: small }), DEFAULTS, false); // 6 из 10 = 60%
  assert.equal(r3.needsConfirm, true);
  assert.equal((r3.data.people as Rec[]).length, 10);
});
test("П10 повтор слияния результата с тем же облаком ничего не меняет (идемпотентность кандидата)", () => {
  const local = book({ people: [...people(3, "l"), { id: "dup", name: "Здесь" }] });
  const cloud = book({ people: [...people(3, "c"), { id: "dup", name: "Там" }] });
  const first = candidateMerge(local, cloud, null, DEFAULTS, false);
  const second = candidateMerge(first.data as never, cloud, null, DEFAULTS, false);
  assert.deepEqual(second.data.people, first.data.people);
  assert.equal(second.conflicts.length, first.conflicts.length);
});

test("П11 восстановление старой копии при СТАРОЙ базе выглядит как удаление новых записей; сброс базы (режим «без базы») возвращает безопасное объединение", () => {
  const base = book({ people: people(10) }); // база с последней синхронизации
  const cloud = book({ people: people(10) });
  const restoredOld = book({ people: people(7) }); // из копии восстановили книгу, где трёх записей ещё не было
  const withStaleBase = candidateMerge(restoredOld, cloud, base, DEFAULTS, false);
  assert.equal((withStaleBase.data.people as Rec[]).length, 7, "с чужой базой три записи выглядят как удалённые здесь и уйдут в облако");
  const baseReset = candidateMerge(restoredOld, cloud, null, DEFAULTS, false);
  assert.equal((baseReset.data.people as Rec[]).length, 10, "без базы записи только с одной стороны не теряются");
});

// ——— 3. Сохранность неизвестных данных (что уже работает и что нет)
test("Ч1 неизвестные ПОЛЯ внутри записей сегодня сохраняются при загрузке из облака, правках, копировании страницы и сохранении; неизвестный КЛЮЧ верхнего уровня теряется", () => {
  const page = { id: "pg1", title: "T", kind: "page", paper: "cream", strokes: [], blocks: [{ id: "b1", type: "text", x: 1, y: 1, w: 10, text: "hi", font: "sans", size: "md", _xb: 1 }], _x: 1 };
  applyBookData({ people: [{ id: "p1", name: "A", _x: 1 }], places: [{ id: "pl1", name: "P", _x: 1 }], stories: [{ id: "s1", title: "S", narrative: "n", attachments: [], _x: 1 }], notes: [{ id: "n1", text: "t", _x: 1 }], pages: [page], photos: [], events: [], documents: [{ id: "d1", _x: 1 }], interviews: [], plan: [{ id: "c1", title: "c", planned: 1, done: false, _x: 1 }], future_key: { a: 1 } } as never);
  const st = useRod.getState() as unknown as Record<string, Rec[] | unknown> & { updatePerson: Function; updatePlace: Function; updateStory: Function; updatePage: Function; duplicatePage: Function; toggleChapter: Function; movePage: Function };
  const kept = (key: string, id: string) => ((useRod.getState() as unknown as Record<string, Rec[]>)[key].find((r) => r.id === id) as Rec | undefined)?._x === 1;
  assert.equal("future_key" in useRod.getState(), false, "новый ключ верхнего уровня отброшен при чтении");
  for (const [k, id] of [["people", "p1"], ["places", "pl1"], ["stories", "s1"], ["notes", "n1"], ["pages", "pg1"], ["documents", "d1"], ["plan", "c1"]] as const) assert.ok(kept(k, id), `${k}: поле сохранено при чтении`);
  assert.equal(((useRod.getState().pages[0] as unknown as { blocks: { _xb?: number }[] }).blocks[0])._xb, 1);
  st.updatePerson("p1", { name: "B" });
  st.updatePlace("pl1", { name: "Q" });
  st.updateStory("s1", { title: "S2" });
  st.updatePage("pg1", (p: Rec) => ({ ...p, title: "T2" }));
  const dup = st.duplicatePage("pg1") as string;
  st.toggleChapter("c1");
  for (const [k, id] of [["people", "p1"], ["places", "pl1"], ["stories", "s1"], ["pages", "pg1"], ["plan", "c1"]] as const) assert.ok(kept(k, id), `${k}: поле сохранено после правки`);
  assert.equal(((useRod.getState().pages as unknown as Rec[]).find((p) => p.id === dup) as Rec)._x, 1);
  assert.match(JSON.stringify({ state: useRod.getState() }), /_x/);
});
