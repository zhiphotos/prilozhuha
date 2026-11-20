// Этап 1 «отношения»: полный цикл настоящих exportBook и importBook (файл .kniga) на синтетической книге. Заготовка окружения взята из person-edit-integration.test.ts. //олжна менять родственные связи.
// Запускается с подстановкой «@/» (src/test-support/register.mjs); браузерных хранилищ в Node нет, поэтому ниже простая заглушка localStorage.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", origin: "http://localhost" } };

g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };


// Скачивание файла в Node: вместо ссылки и клика забираем то, что приложение хотело отдать браузеру.
let saved: Blob | null = null;
let savedName = "";
g.document = {
  addEventListener() {},
  removeEventListener() {},
  visibilityState: "visible",
  body: { appendChild() {} },
  createElement: () => ({ href: "", set download(v: string) { savedName = v; }, click() {}, remove() {} }),
};
(g.window as { setTimeout: unknown }).setTimeout = () => 0; // отзыв ссылки через минуту здесь не нужен и не должен держать тест
const realCreate = URL.createObjectURL.bind(URL);
URL.createObjectURL = (b: Blob | MediaSource) => { saved = b as Blob; return realCreate(b as Blob); };

const { useRod } = await import("./store.ts");
const { exportBook, importBook } = await import("./backup.ts");
type Person = ReturnType<typeof useRod.getState>["people"][number];

const man = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, relation: "", birthYear: "", maidenName: "", notes: "", ...extra }) as Person;
const synthetic = (): Person[] => [
  man("мать"), man("отец"), man("усыновитель"), man("усыновительница"), man("опекунша"), man("приёмная-семья"),
  man("ребёнок", { parents: ["мать", "отец"], adoptedBy: [{ id: "усыновитель", year: "1999" }, { id: "усыновительница" }], caredBy: [{ id: "опекунша", role: "guardian", from: "2001", to: "2005" }, { id: "приёмная-семья", role: "foster" }] }),
  man("без-связей", { parents: ["мать"] }),
];

test("5. настоящие exportBook и importBook: связи, экспорт в файл, закрытие книги, импорт файла, связи на месте", async () => {
  useRod.setState({ people: JSON.parse(JSON.stringify(synthetic())) as Person[] });
  const before = JSON.stringify(useRod.getState().people);

  assert.equal(await exportBook(), "downloaded");
  assert.ok(saved, "приложение отдало файл");
  assert.match(savedName, /\.kniga$/);
  const text = await (saved as Blob).text();
  const file = new File([text], savedName, { type: "application/json" });

  // Закрываем книгу: в хранилище пусто.
  useRod.setState({ people: [] });
  assert.equal(useRod.getState().people.length, 0);

  await importBook(file);
  const after = useRod.getState().people;
  assert.equal(JSON.stringify(after), before, "люди после импорта совпадают с исходными целиком");
  const c = after.find((p) => p.id === "ребёнок")!;
  assert.deepEqual(c.parents, ["мать", "отец"], "биологические родители");
  assert.deepEqual(c.adoptedBy, [{ id: "усыновитель", year: "1999" }, { id: "усыновительница" }], "усыновители");
  assert.deepEqual(c.caredBy, [{ id: "опекунша", role: "guardian", from: "2001", to: "2005" }, { id: "приёмная-семья", role: "foster" }], "опека");
  assert.ok(!("adoptedBy" in after.find((p) => p.id === "без-связей")!), "у остальных новых полей нет");
});

test("5б. настоящий цикл для старой книги: файл и импорт возвращают её без изменений и без новых полей", async () => {
  const old = (JSON.parse(readFileSync(fileURLToPath(new URL("../tree/fixtures/diag-1101-anon.json", import.meta.url)), "utf8")) as { people: Person[] }).people;
  useRod.setState({ people: JSON.parse(JSON.stringify(old)) as Person[] });
  const before = JSON.stringify(useRod.getState().people);
  await exportBook();
  const text = await (saved as Blob).text();
  useRod.setState({ people: [] });
  await importBook(new File([text], "x.kniga"));
  assert.equal(JSON.stringify(useRod.getState().people), before);
});

test("5в. настоящий цикл .kniga: отметка «общий ребёнок» (parentsUnmarried) сохраняется вместе с родителями", async () => {
  const people = [man("М"), man("Д"), man("К", { parents: ["М", "Д"], parentsUnmarried: true })];
  useRod.setState({ people: JSON.parse(JSON.stringify(people)) as Person[] });
  const before = JSON.stringify(useRod.getState().people);
  await exportBook();
  const text = await (saved as Blob).text();
  useRod.setState({ people: [] });
  await importBook(new File([text], "x.kniga"));
  assert.equal(JSON.stringify(useRod.getState().people), before);
  assert.equal(useRod.getState().people.find((p) => p.id === "К")?.parentsUnmarried, true);
});
