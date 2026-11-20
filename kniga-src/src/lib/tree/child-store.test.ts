// Этап 3а: добавление ребёнка со вторым родителем в настоящем хранилище книги (действия addChildWithParents и attachChildWithParents). Заготовка окружения как в recenter-store.test.ts.
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
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", search: "", hash: "" }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

const { useRod } = await import("../rod/store.ts");
const { useTree, emptyDraft } = await import("./ui-store.ts");
type Person = ReturnType<typeof useRod.getState>["people"][number];
const man = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, name: id, firstName: id, lastName: "", relation: "", birthYear: "", maidenName: "", notes: "", gender, fromFile: true, ...extra }) as Person;
const load = (people: Person[]) => { useRod.setState({ people: JSON.parse(JSON.stringify(people)) as Person[] }); };
const now = () => useRod.getState().people;
const draft = (name: string, extra: Partial<ReturnType<typeof emptyDraft>> = {}) => ({ ...emptyDraft("m"), firstName: name, ...extra });
const marriageFields = (people: Person[]) => JSON.stringify(people.map((p) => [p.id, p.spouse, p.spouseStatus, p.moreSpouses, p.unionFrom, p.unionTo, p.adoptedBy, p.caredBy]));

test("действие: ребёнок с подтверждённым партнёром; браки, усыновители и опекуны всех людей не изменились", async () => {
  load([man("М", "f", { spouse: "Х", adoptedBy: [{ id: "Н" }], caredBy: [{ id: "Оп", role: "guardian" }] }), man("Х", "m", { spouse: "М" }), man("Н", "m"), man("Оп", "f")]);
  const before = marriageFields(now());
  const r = await useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "partner", id: "Х" });
  assert.equal(r.ok, true, JSON.stringify(r));
  const c = now().find((p) => p.firstName === "Малыш")!;
  assert.deepEqual(c.parents, ["М", "Х"]);
  assert.equal(marriageFields(now().filter((p) => p.id !== c.id)), before, "браки, партнёры, усыновители и опекуны не тронуты");
  assert.ok(!c.spouse && !c.moreSpouses);
});

test("действие: другой отец при официальном муже, без брака; муж не родитель", async () => {
  load([man("М", "f", { spouse: "Х" }), man("Х", "m", { spouse: "М" }), man("Д", "m")]);
  const before = marriageFields(now());
  const r = await useTree.getState().addChildWithParents("М", "daughter", draft("Дочка", { gender: "f" }), { mode: "existing", id: "Д" });
  assert.equal(r.ok, true, JSON.stringify(r));
  const c = now().find((p) => p.firstName === "Дочка")!;
  assert.deepEqual(c.parents, ["М", "Д"]);
  assert.equal(c.parentsUnmarried, true);
  assert.equal(c.gender, "f");
  assert.equal(marriageFields(now().filter((p) => p.id !== c.id)), before);
});

test("действие: новый второй родитель создаётся без супруга вместе с ребёнком одним обновлением", async () => {
  load([man("М", "f")]);
  const seen: number[] = [];
  const unsub = useRod.subscribe((s) => seen.push(s.people.length));
  const r = await useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "new", draft: draft("Отец") });
  unsub();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(seen.filter((n) => n > 1), seen.filter((n) => n > 1).map(() => 3), "ребёнок и новый родитель появились разом: промежуточного состояния с двумя нет");
  const father = now().find((p) => p.firstName === "Отец")!;
  assert.ok(father && !father.spouse && !father.moreSpouses);
  assert.equal(now().length, 3);
});

test("действие: двойное нажатие не создаёт дубликата, повтор той же записи требует подтверждения", async () => {
  load([man("М", "f")]);
  const [a, b] = await Promise.all([useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "unknown" }), useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "unknown" })]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, "второй вызов отклонён, пока идёт первый");
  assert.equal(now().filter((p) => p.firstName === "Малыш").length, 1);
  const again = await useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "unknown" });
  assert.equal(again.ok, false, "повтор по имени спрашивает подтверждение");
  assert.ok(!again.ok && again.needs?.similar?.length);
  const forced = await useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "unknown" }, { notDuplicate: true });
  assert.equal(forced.ok, true);
});

test("действие: ошибка ничего не оставляет", async () => {
  load([man("М", "f")]);
  const before = JSON.stringify(now());
  const r = await useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "new", draft: draft("") });
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(now()), before);
  const r2 = await useTree.getState().addChildWithParents("нет-такого", "son", draft("К"), { mode: "unknown" });
  assert.equal(r2.ok, false);
  assert.equal(JSON.stringify(now()), before);
});

test("действие: существующий человек как ребёнок; родителей не заменит без подтверждения, усыновитель остаётся", () => {
  load([man("М", "f"), man("О", "m"), man("Д", "m"), man("Н", "m"), man("К", "m", { parents: ["М", "О"], adoptedBy: [{ id: "Н" }] })]);
  const r = useTree.getState().attachChildWithParents("М", "К", { mode: "existing", id: "Д" });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.needs?.replaceParents);
  assert.deepEqual(now().find((p) => p.id === "К")!.parents, ["М", "О"]);
  const ok = useTree.getState().attachChildWithParents("М", "К", { mode: "existing", id: "Д" }, { replaceParents: true });
  assert.equal(ok.ok, true);
  const k = now().find((p) => p.id === "К")!;
  assert.deepEqual(k.parents, ["М", "Д"]);
  assert.deepEqual(k.adoptedBy, [{ id: "Н" }]);
});

test("действие: удаление человека после «общего ребёнка» не оставляет битых ссылок", async () => {
  load([man("М", "f"), man("Д", "m")]);
  const r = await useTree.getState().addChildWithParents("М", "son", draft("Малыш"), { mode: "existing", id: "Д" });
  assert.equal(r.ok, true);
  useRod.getState().removePerson("Д");
  assert.deepEqual(now().find((p) => p.firstName === "Малыш")!.parents, ["М"]);
});
