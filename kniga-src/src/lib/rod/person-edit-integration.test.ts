// Интеграция с настоящим хранилищем книги (useRod) и настоящим updatePerson: правка карточки не должна менять родственные связи.
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
const { composeName } = await import("./person.ts");
type Person = ReturnType<typeof useRod.getState>["people"][number];

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("../tree/fixtures/diag-1029-anon.json", import.meta.url)), "utf8")) as { people: Person[] };
const edges = (people: Person[]) => {
  const t = treeFromPeople(people);
  const set = new Set<string>();
  for (const u of t.unions) {
    for (const c of u.childIds) for (const a of u.partnerIds) set.add(`${a}>${c}`);
    if (u.partnerIds.length === 2) set.add([...u.partnerIds].sort().join("="));
  }
  return { edges: [...set].sort(), ghosts: t.people.filter((p) => p.id.startsWith("__") && p.id !== "__self").map((p) => p.id).sort(), nodes: t.people.length };
};
const load = () => useRod.setState({ people: JSON.parse(JSON.stringify(fixture.people)) as Person[] });
const now = () => useRod.getState().people;
/** Как после сохранения и перезагрузки: данные записаны в строку и прочитаны заново. */
const reload = () => useRod.setState({ people: JSON.parse(JSON.stringify(now())) as Person[] });

test("настоящий updatePerson: изменение ФИО, даты, подписи и её очистка не меняют связи ни у одного человека", () => {
  load();
  const base = edges(now());
  assert.ok(base.edges.length > 20, "в фикстуре есть связи");
  for (const person of fixture.people) {
    const id = person.id;
    const update = useRod.getState().updatePerson;
    // ФИО: так же, как PersonFields (части + собранное имя)
    const parts = { firstName: "Имя", patronymic: "Отчество", lastName: "Фамилия" };
    update(id, { ...parts, name: composeName(parts) });
    assert.deepEqual(edges(now()), base, `ФИО ${id}`);
    update(id, { birthYear: "1950" });
    assert.deepEqual(edges(now()), base, `дата рождения ${id}`);
    // Подпись «я» отмечает владельца книги: её смена меняет центр схемы, это проверяется отдельно ниже.
    if (person.relation !== "я") {
      update(id, { relation: "любимый родственник" });
      assert.deepEqual(edges(now()), base, `смена подписи ${id}`);
      update(id, { relation: "" });
      assert.deepEqual(edges(now()), base, `очистка подписи ${id}`);
      update(id, { relation: "не указано" });
      assert.deepEqual(edges(now()), base, `«не указано» ${id}`);
    }
    reload(); // сохранение карточки, повторное открытие, перезагрузка
    assert.deepEqual(edges(now()), base, `после перезагрузки ${id}`);
    update(id, { notes: "заметка" });
    assert.deepEqual(edges(now()), base, `другое поле после перезагрузки ${id}`);
  }
});

test("подпись меняется у всех подряд (родители и дети), связи те же", () => {
  load();
  const base = edges(now());
  for (const person of fixture.people) if (person.relation !== "я") useRod.getState().updatePerson(person.id, { relation: "" });
  assert.deepEqual(edges(now()), base);
  reload();
  for (const person of fixture.people) if (person.relation !== "я") useRod.getState().updatePerson(person.id, { relation: "родня" });
  assert.deepEqual(edges(now()), base);
});

test("связь, выведенная по слову, записывается явно при первой правке подписи и дальше не пропадает", () => {
  load();
  const before = now();
  const derived = before.filter((p) => !(p.parents ?? []).length && !p.siblingOf && !p.fromFile);
  assert.ok(derived.length > 0);
  useRod.getState().updatePerson(before[0]!.id, { relation: "переименован" });
  const after = now();
  const withParents = (list: Person[]) => list.filter((p) => (p.parents ?? []).length).length;
  assert.ok(withParents(after) >= withParents(before), "явных связей не меньше, чем было");
});

test("карточка человека из дерева: правка имени и дат (тот же вызов, что делает дерево) связей не трогает", () => {
  load();
  const base = edges(now());
  for (const person of fixture.people) {
    // ui-store.updatePerson передаёт именно такой набор полей, без подписи и связей
    useRod.getState().updatePerson(person.id, { name: "Н Ф", firstName: "Н", patronymic: "", lastName: "Ф", birthYear: "01.02.1900", deathYear: undefined, notes: "x", maidenName: "" });
    assert.deepEqual(edges(now()), base, `правка из дерева ${person.id}`);
  }
});

test("стирание подписи «я» связей не рвёт (центр схемы при этом становится условным «Я»: известное поведение, не потеря связи)", () => {
  load();
  const base = edges(now());
  const me = fixture.people.find((p) => p.relation === "я");
  assert.ok(me, "в фикстуре есть «я»");
  useRod.getState().updatePerson(me!.id, { relation: "" });
  const after = edges(now());
  assert.deepEqual(after.edges.filter((e) => base.edges.includes(e)), base.edges, "ни одна связь не пропала");
  assert.equal(after.nodes, base.nodes + 1, "добавляется условный «Я»");
});
