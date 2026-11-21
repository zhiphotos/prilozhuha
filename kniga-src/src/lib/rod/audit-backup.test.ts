// Аудит резервного копирования (ветка claude/audit-tree-tests, в main не сливается). Только тестовые данные и поддельный IndexedDB в памяти.
// { todo } = описано ПРАВИЛЬНОЕ поведение, сейчас не соблюдается (node:test не считает это провалом).
import assert from "node:assert/strict";
import test from "node:test";

type Req = { result?: unknown; error?: unknown; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void };
const stores: Record<string, Map<string, unknown>> = { state: new Map(), media: new Map() };
let failWrites = false;
const later = (f: () => void) => queueMicrotask(f);
const fakeDb = {
  objectStoreNames: { contains: () => true },
  createObjectStore() {},
  transaction(name: string) {
    const m = stores[name]!; const tx: { oncomplete?: () => void; onerror?: () => void; error?: unknown } = {};
    const done = () => later(() => tx.oncomplete?.());
    const res = (value: unknown): Req => { const r: Req = {}; later(() => { r.result = value; r.onsuccess?.(); }); return r; };
    return {
      get oncomplete() { return tx.oncomplete; }, set oncomplete(f) { tx.oncomplete = f; },
      get onerror() { return tx.onerror; }, set onerror(f) { tx.onerror = f; },
      get error() { return tx.error; },
      objectStore: () => ({
        get: (k: string) => res(m.get(k)),
        getAllKeys: () => res([...m.keys()]),
        put: (v: unknown, k: string) => { if (failWrites) { tx.error = new DOMException("full", "QuotaExceededError"); later(() => tx.onerror?.()); } else { m.set(k, v); done(); } },
        delete: (k: string) => { m.delete(k); done(); },
      }),
    };
  },
};
(globalThis as any).indexedDB = { open() { const r: Req = {}; later(() => { r.result = fakeDb; r.onsuccess?.(); }); return r; } };
(globalThis as any).window ??= { setTimeout: (f: () => void) => setTimeout(f, 0), clearTimeout: (t: number) => clearTimeout(t), addEventListener() {}, location: { href: "http://localhost/" } };
(globalThis as any).document ??= { fonts: { add() {}, load: async () => [], ready: Promise.resolve(), check: () => true }, head: { appendChild() {} }, body: { appendChild() {} }, createElement: () => ({ style: {}, click() {}, remove() {}, setAttribute() {} }), addEventListener() {}, visibilityState: "visible" };
(globalThis as any).FileReader ??= class { result: unknown; onload?: () => void; onerror?: () => void; readAsDataURL(b: Blob) { void b.arrayBuffer().then((buf) => { this.result = `data:${b.type || "application/octet-stream"};base64,${Buffer.from(buf).toString("base64")}`; this.onload?.(); }); } };
(globalThis as any).FontFace ??= class { load() { return Promise.resolve(this); } };
(globalThis as any).localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };

const { importBook, exportBook } = await import("./backup.ts");
const { useRod } = await import("./store.ts");
const { saveMedia } = await import("./media.ts");

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const person = (id: string, name: string, photo = "") => ({ id, name, relation: "Родственник", maidenName: "", notes: "", birthYear: "", photo });
const copyFile = (data: Record<string, unknown>, media: Record<string, string> = {}) => new File([JSON.stringify({ app: "kniga-roda", version: 1, savedAt: "2026-01-01", data, media })], "копия.kniga");
const reset = () => { useRod.setState({ pages: [], stories: [], people: [] } as never); failWrites = false; for (const m of Object.values(stores)) m.clear(); };

test("импорт: обычная копия заменяет людей и не дублирует их при повторном открытии", async () => {
  reset();
  useRod.setState({ people: [person("old", "Старый")] as never });
  const f = copyFile({ people: [person("a", "Анна"), person("b", "Борис")] });
  await importBook(f); await importBook(f);
  assert.deepEqual(useRod.getState().people.map((p) => p.id), ["a", "b"]);
});

test("импорт: повторное открытие копии с фото создаёт новые копии фото (утечка хранилища, не дубли людей)", async () => {
  reset();
  const f = copyFile({ people: [person("a", "Анна", "media:p1")] }, { "media:p1": PNG });
  await importBook(f); const first = stores.media!.size;
  await importBook(f); const second = stores.media!.size;
  assert.equal(first, 1); assert.equal(second, 2, "каждое открытие кладёт фото заново, старое не удаляется");
});

test("импорт: файл не из Книги рода отклоняется до любых изменений", async () => {
  reset(); useRod.setState({ people: [person("keep", "Остаётся")] as never });
  await assert.rejects(importBook(new File([JSON.stringify({ app: "other", data: {} })], "x")), /Это не копия/);
  assert.deepEqual(useRod.getState().people.map((p) => p.id), ["keep"]);
});

test("импорт: оборванный JSON даёт SyntaxError, книга не тронута", async () => {
  reset(); useRod.setState({ people: [person("keep", "Остаётся")] as never });
  await assert.rejects(importBook(new File(['{"app":"kniga-roda","data":{"people":[{"id":'], "x")), SyntaxError);
  assert.deepEqual(useRod.getState().people.map((p) => p.id), ["keep"]);
});

test("импорт: нехватка места при записи фото не меняет книгу", async () => {
  reset(); useRod.setState({ people: [person("keep", "Остаётся")] as never });
  failWrites = true;
  await assert.rejects(importBook(copyFile({ people: [person("a", "Анна", "media:p1")] }, { "media:p1": PNG })));
  assert.deepEqual(useRod.getState().people.map((p) => p.id), ["keep"]);
  failWrites = false;
});

test("ДЕФЕКТ B-2: копия без каких-то разделов не должна оставлять в книге разделы прежней книги", { todo: "importBook: setState(clean) сливает, а не заменяет; ключи DATA_KEYS, которых нет в файле, остаются от старой книги" }, async () => {
  reset();
  useRod.setState({ people: [person("old", "Старый")] as never, stories: [{ id: "s-old", title: "Старая история" }] as never });
  await importBook(copyFile({ people: [person("a", "Анна")] }));
  assert.deepEqual(useRod.getState().stories, [], "истории прежней книги смешались с новой");
});

test("ДЕФЕКТ B-3: копия с нарушенной структурой не должна применяться и портить книгу", { todo: "importBook не проверяет типы разделов; afterHydrate падает ПОСЛЕ setState, книга уже испорчена" }, async () => {
  reset();
  useRod.setState({ people: [person("keep", "Остаётся")] as never });
  await importBook(copyFile({ people: [person("a", "Анна")], pages: "не массив" })).catch(() => undefined);
  assert.ok(Array.isArray(useRod.getState().pages), "pages должно остаться массивом");
  assert.deepEqual(useRod.getState().people.map((p) => p.id), ["keep"], "при отказе книга должна остаться прежней");
});

test("ДЕФЕКТ B-4: копия из будущей версии приложения должна отклоняться понятным сообщением", { todo: "поле version не проверяется" }, async () => {
  reset();
  await assert.rejects(importBook(new File([JSON.stringify({ app: "kniga-roda", version: 99, data: { people: [] } })], "x")), /верси/i);
});

test("ДЕФЕКТ B-5: экспорт не должен объявлять успех, если фото не прочиталось (в файл попала пустая строка)", { todo: "exportBook: mediaDataUrl возвращает '' при нехватке фото, копия собирается и счётчик правок обнуляется" }, async () => {
  reset();
  const ok = await saveMedia(PNG);
  useRod.setState({ people: [person("a", "Анна", ok), person("b", "Борис", "media:нет-такого")] as never });
  let saved = "";
  Object.defineProperty(globalThis, "navigator", { value: { share: undefined }, configurable: true });
  (globalThis as any).URL.createObjectURL = (b: Blob) => { void b.text().then((t) => (saved = t)); return "blob:x"; };
  let outcome = "";
  try { outcome = await exportBook(); } catch (e) { outcome = "отказ: " + (e as Error).message; }
  await new Promise((r) => setTimeout(r, 30));
  const media = (saved ? JSON.parse(saved).media : null) as Record<string, string> | null;
  assert.ok(media, `копия не собралась: ${outcome}`);
  assert.ok(outcome.startsWith("отказ") || !Object.values(media!).includes(""), `экспорт вернул «${outcome}», но в копии есть пустая запись фото: ${JSON.stringify(Object.fromEntries(Object.entries(media!).map(([k, v]) => [k, v.slice(0, 12)])))}`);
});
