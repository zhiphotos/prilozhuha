// Добавление родителей через настоящий addRelative (схема древа) на обезличенном файле тестировщика (D, 01.11): уже стоящие связи не должны пропадать.
// Причина жалобы: у человека родители выводились по слову «Кем приходится» (в данных поля «родители» не было), а новый родитель записывался как единственный явный, поэтому выведенные дед и бабка отрывались.
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
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", search: "", hash: "" }, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

const { useRod } = await import("./store.ts");
const { useTree } = await import("../tree/ui-store.ts");
const { treeFromPeople } = await import("../tree/from-people.ts");
type Person = ReturnType<typeof useRod.getState>["people"][number];

const loadFixture = (name: string) => JSON.parse(readFileSync(fileURLToPath(new URL(`../tree/fixtures/${name}`, import.meta.url)), "utf8")) as { people: Person[] };
const fixture = loadFixture("diag-1101-anon.json");
const edges = () => {
  const t = treeFromPeople(useRod.getState().people);
  const set = new Set<string>();
  for (const u of t.unions) {
    for (const c of u.childIds) for (const a of u.partnerIds) set.add(`${a}>${c}`);
    if (u.partnerIds.length === 2) set.add([...u.partnerIds].sort().join("="));
  }
  return set;
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
const draft = (name: string) => ({ firstName: name, patronymic: "", lastName: "", gender: "u" as const, birthYear: "", deathYear: "", note: "", maidenName: "", photo: "" });

test("добавление отца человеку с выведенными родителями не отрывает от него выведенных деда и бабку", async () => {
  useRod.setState({ people: JSON.parse(JSON.stringify(fixture.people)) as Person[] });
  const mom = fixture.people.find((p) => p.relation === "мама")!;
  assert.ok(!mom.parents?.length, "в данных родителей у мамы нет, они выводятся по слову");
  const before = edges();
  const parentsBefore = [...before].filter((e) => e.endsWith(`>${mom.id}`));
  assert.ok(parentsBefore.length >= 1, "в схеме у мамы есть родители");
  const answer = useTree.getState().addRelative(mom.id, "father", draft("Новый"));
  assert.equal(answer, null);
  await tick();
  const after = edges();
  const lost = [...before].filter((e) => !after.has(e) && !e.includes("__"));
  assert.deepEqual(lost, [], "ни одна прежняя связь не пропала: " + lost.join(", "));
  assert.ok([...after].some((e) => e.endsWith(`>${mom.id}`) && !parentsBefore.includes(e)), "новый отец появился");
});

for (const file of ["diag-1101-anon.json", "diag-1030-anon.json", "diag-1029b-anon.json", "diag-1029-anon.json"]) {
  for (const kind of ["father", "mother"] as const) {
    test(`${file}: добавление ${kind === "father" ? "отца" : "матери"} любому человеку без явных родителей не теряет ни одной прежней связи`, async () => {
      const data = loadFixture(file).people;
      const lostAll: string[] = [];
      for (const person of data) {
        if (person.parents?.length || person.siblingOf || person.fromFile) continue;
        useRod.setState({ people: JSON.parse(JSON.stringify(data)) as Person[] });
        const before = edges();
        const answer = useTree.getState().addRelative(person.id, kind, draft("Новый"));
        if (answer) continue; // например, «уже два родителя»: ничего не добавлено
        await tick();
        const after = edges();
        const lost = [...before].filter((e) => !after.has(e) && !e.includes("__"));
        if (lost.length) lostAll.push(`${person.id}(${person.relation}): ${lost.join(" ")}`);
      }
      assert.deepEqual(lostAll, []);
    });
  }
}
