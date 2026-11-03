// Смена центра дерева в настоящем хранилище: данные книги не меняются, ничего не пишется, возврат к «я» работает.
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

const { useRod } = await import("../rod/store.ts");
const { useTree } = await import("./ui-store.ts");
const { relationsFrom, viewFrom } = await import("./recenter.ts");
type Person = ReturnType<typeof useRod.getState>["people"][number];

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/diag-1101-anon.json", import.meta.url)), "utf8")) as { people: Person[] };
const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

test("смена центра на каждого человека: книга, древо и память устройства не меняются", async () => {
  useRod.setState({ people: JSON.parse(JSON.stringify(fixture.people)) as Person[] });
  await tick();
  const home = useTree.getState().homeId;
  assert.equal(useTree.getState().focusId, home);
  const rodBefore = JSON.stringify(useRod.getState().people);
  const treeBefore = JSON.stringify({ p: useTree.getState().people, u: useTree.getState().unions });
  let rodNotifications = 0;
  const off = useRod.subscribe(() => { rodNotifications += 1; });
  const keysBefore = [...mem.keys()].sort().join();
  for (const person of useTree.getState().people.filter((x) => !x.id.startsWith("__"))) {
    useTree.getState().setFocus(person.id);
    assert.equal(useTree.getState().focusId, person.id);
    const { people, unions, focusId } = useTree.getState();
    assert.equal(relationsFrom(people, unions, focusId).get(focusId)!.kind, "center");
    viewFrom(people, unions, focusId, "blood");
  }
  useTree.getState().setFocus("нет-такого-человека");
  assert.notEqual(useTree.getState().focusId, "нет-такого-человека", "несуществующий центр не принимается");
  useTree.getState().resetFocus();
  assert.equal(useTree.getState().focusId, home);
  off();
  await tick();
  assert.equal(rodNotifications, 0, "книга не получала записей");
  assert.equal(JSON.stringify(useRod.getState().people), rodBefore);
  assert.equal(JSON.stringify({ p: useTree.getState().people, u: useTree.getState().unions }), treeBefore);
  assert.equal([...mem.keys()].sort().join(), keysBefore, "ничего нового не записано в память устройства");
});
