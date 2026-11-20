// Этап 1 «отношения»: хранение усыновителей (adoptedBy) и опекунов (caredBy) в настоящем хранилище книги. Заготовка окружения взята из person-edit-integration.test.ts. //олжна менять родственные связи.
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

const { useRod } = await import("./store.ts");
const { treeFromPeople } = await import("../tree/from-people.ts");

import { applyPatch, withoutPerson } from "../tree/auto-links.ts";
import { relationRefProblems, renameRelationRefs } from "./relation-links.ts";
type Person = ReturnType<typeof useRod.getState>["people"][number];

const book = (name: string) => (JSON.parse(readFileSync(fileURLToPath(new URL(`../tree/fixtures/${name}`, import.meta.url)), "utf8")) as { people: Person[] }).people;
const man = (id: string, extra: Partial<Person> = {}): Person => ({ id, name: id, relation: "", birthYear: "", maidenName: "", notes: "", ...extra }) as Person;
const family = (): Person[] => [
  man("мать"), man("отец"), man("усыновитель"), man("опекунша"), man("пасынок-мама"),
  man("ребёнок", { parents: ["мать", "отец"], adoptedBy: [{ id: "усыновитель", year: "1999" }], caredBy: [{ id: "опекунша", role: "guardian", from: "2001" }] }),
];
const load = (people: Person[]) => useRod.setState({ people: JSON.parse(JSON.stringify(people)) as Person[] });
const now = () => useRod.getState().people;
const child = () => now().find((p) => p.id === "ребёнок")!;
const roundTrip = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

test("1-3. биологические родители, усыновители и опекуны лежат в трёх отдельных полях и переживают сохранение и открытие", () => {
  load(family());
  assert.deepEqual(child().parents, ["мать", "отец"]);
  assert.deepEqual(child().adoptedBy, [{ id: "усыновитель", year: "1999" }]);
  assert.deepEqual(child().caredBy, [{ id: "опекунша", role: "guardian", from: "2001" }]);
  // как после записи в хранилище и повторного открытия: строка и обратно
  useRod.setState({ people: roundTrip(now()) });
  assert.deepEqual(child().parents, ["мать", "отец"]);
  assert.deepEqual(child().adoptedBy, [{ id: "усыновитель", year: "1999" }]);
  assert.deepEqual(child().caredBy, [{ id: "опекунша", role: "guardian", from: "2001" }]);
});

test("правки карточки и связей не стирают усыновителей и опекунов, а новые поля не меняют древо", () => {
  load(family());
  const without = family().map((p) => ({ ...p, adoptedBy: undefined, caredBy: undefined }));
  assert.deepEqual(JSON.parse(JSON.stringify(treeFromPeople(now()).unions)), JSON.parse(JSON.stringify(treeFromPeople(without as Person[]).unions)), "дерево строится только из биологических связей и браков");
  useRod.getState().updatePerson("ребёнок", { birthYear: "1990" });
  useRod.getState().updatePerson("ребёнок", { parents: ["мать"] });
  useRod.getState().updatePerson("мать", { spouse: "отец" });
  assert.deepEqual(child().adoptedBy, [{ id: "усыновитель", year: "1999" }]);
  assert.equal(child().caredBy?.length, 1);
  assert.deepEqual(child().parents, ["мать"], "биологические родители меняются только своей правкой");
  const patched = applyPatch(now(), { ребёнок: { notes: "x" } } as never);
  assert.ok(patched.find((p) => p.id === "ребёнок")?.adoptedBy);
});

test("8. удаление человека: нет битых ссылок, остальные связи не тронуты", () => {
  load(family());
  useRod.getState().removePerson("усыновитель");
  assert.equal(child().adoptedBy, undefined, "пустой список не хранится");
  assert.equal(child().caredBy?.length, 1, "опека осталась");
  assert.deepEqual(child().parents, ["мать", "отец"], "биологические родители не затронуты");
  assert.deepEqual(relationRefProblems(now()), []);
  useRod.getState().removePerson("опекунша");
  assert.equal(child().caredBy, undefined);
  assert.deepEqual(relationRefProblems(now()), []);
  load(family());
  useRod.getState().removePerson("отец");
  assert.deepEqual(child().parents, ["мать"]);
  assert.equal(child().adoptedBy?.length, 1, "удаление биологического родителя не трогает усыновителя");
  assert.deepEqual(relationRefProblems(now()), []);
  // с несколькими усыновителями убирается только один
  load([man("a1"), man("a2"), man("k", { adoptedBy: [{ id: "a1" }, { id: "a2" }] })]);
  useRod.getState().removePerson("a1");
  assert.deepEqual(now().find((p) => p.id === "k")?.adoptedBy, [{ id: "a2" }]);
});

test("проверка битых ссылок находит: несуществующего, самого себя, повтор", () => {
  const bad = [man("x", { adoptedBy: [{ id: "x" }, { id: "нет" }, { id: "y" }, { id: "y" }], caredBy: [{ id: "нет2", role: "foster" }] }), man("y")];
  const kinds = relationRefProblems(bad).map((p) => `${p.list}:${p.kind}`).sort();
  assert.deepEqual(kinds, ["adoptedBy:duplicate", "adoptedBy:self", "adoptedBy:unknown", "caredBy:unknown"]);
  assert.deepEqual(relationRefProblems(family()), []);
});

test("«Я»: ссылки на заглушку переезжают на настоящую запись", () => {
  const p = man("k", { adoptedBy: [{ id: "__self" }], caredBy: [{ id: "__self", role: "guardian" }] });
  const r = renameRelationRefs(p, "__self", "new");
  assert.deepEqual(r.adoptedBy, [{ id: "new" }]);
  assert.deepEqual(r.caredBy, [{ id: "new", role: "guardian" }]);
  assert.equal(renameRelationRefs(man("z"), "__self", "new").adoptedBy, undefined);
});

// Прежний withoutPerson (до этапа 1), как эталон: на старых книгах результат обязан совпадать с ним строка в строку.
function oldWithoutPerson(people: Person[], id: string): Person[] {
  return people.filter((p) => p.id !== id).map((p) => {
    let next = p;
    if (next.parents?.includes(id)) next = { ...next, parents: next.parents.filter((x) => x !== id) };
    if (next.spouse === id) next = { ...next, spouse: undefined };
    if (next.moreSpouses?.some((m) => m.id === id)) next = { ...next, moreSpouses: next.moreSpouses.filter((m) => m.id !== id) };
    if (next.siblingOf === id) next = { ...next, siblingOf: undefined };
    return next;
  });
}

for (const name of ["diag-1029-anon.json", "diag-1101-anon.json"]) {
  test(`4. старая книга ${name}: открытие, сохранение, удаление любого человека дают то же, что раньше`, () => {
    const people = book(name);
    load(people);
    const text = JSON.stringify(now());
    useRod.setState({ people: JSON.parse(text) as Person[] });
    assert.equal(JSON.stringify(now()), text, "сохранить и открыть: без изменений");
    assert.ok(now().every((p) => !("adoptedBy" in p) && !("caredBy" in p)), "новых полей у старых людей нет");
    for (const p of people) assert.equal(JSON.stringify(withoutPerson(people, p.id)), JSON.stringify(oldWithoutPerson(people, p.id)), `удаление ${p.id}`);
  });
}

// Копия книги (.kniga): те же шаги, что в exportBook и importBook (ключи DATA_KEYS, JSON туда и обратно). Сами функции работают с файлами браузера.
test("5. файл .kniga: людей с усыновителями и опекунами копия переносит целиком", async () => {
  const { DATA_KEYS } = await import("./backup.ts");
  assert.ok((DATA_KEYS as readonly string[]).includes("people"), "люди входят в копию, значит и их новые поля");
  load(family());
  const data = Object.fromEntries(DATA_KEYS.map((k) => [k, (useRod.getState() as unknown as Record<string, unknown>)[k]]));
  const file = JSON.stringify({ app: "kniga-roda", version: 1, data, media: {} });
  const parsed = JSON.parse(file) as { data: Record<string, unknown> };
  const clean = Object.fromEntries(DATA_KEYS.filter((k) => k in parsed.data).map((k) => [k, parsed.data[k]]));
  useRod.setState({ people: [] });
  useRod.setState(clean);
  assert.deepEqual(child().parents, ["мать", "отец"]);
  assert.deepEqual(child().adoptedBy, [{ id: "усыновитель", year: "1999" }]);
  assert.deepEqual(child().caredBy, [{ id: "опекунша", role: "guardian", from: "2001" }]);
  // старая книга через копию: байт в байт
  const old = book("diag-1029-anon.json");
  useRod.setState({ people: JSON.parse(JSON.stringify(old)) as Person[] });
  const d2 = Object.fromEntries(DATA_KEYS.map((k) => [k, (useRod.getState() as unknown as Record<string, unknown>)[k]]));
  assert.equal(JSON.stringify((JSON.parse(JSON.stringify({ data: d2 })) as { data: { people: unknown } }).data.people), JSON.stringify(old));
});
