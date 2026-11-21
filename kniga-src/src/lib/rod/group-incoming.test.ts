import assert from "node:assert/strict";
import test from "node:test";
import { groupIncoming } from "./group-incoming.ts";
import type { Incoming } from "./family.ts";

const ch = (id: string, who: string, after: Record<string, unknown>, extra: Incoming["changes"] = []): Incoming => ({
  id, kind: "changes", at: 1, from: { name: who, relation: "мама" }, title: "", question: "", text: "",
  changes: [{ key: "people", kind: "edit", id: "me", before: { id: "me", birthYear: "1990" }, after: { id: "me", ...after } }, ...(extra ?? [])],
});

test("Г1 одинаковое предложение дважды: одна карточка, подтверждаются обе записи", () => {
  const g = groupIncoming([ch("i1", "Мама", { birthYear: "1991" }), ch("i2", "Мама", { birthYear: "1991" })]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids, ["i1", "i2"]);
});
test("Г2 разные предложения к одной записи не объединяются (другое значение, другое поле)", () => {
  assert.equal(groupIncoming([ch("i1", "Мама", { birthYear: "1991" }), ch("i2", "Мама", { birthYear: "1992" })]).length, 2);
  assert.equal(groupIncoming([ch("i1", "Мама", { birthYear: "1991" }), ch("i2", "Мама", { birthYear: "1991", name: "Р" })]).length, 2);
});
test("Г3 одинаковое содержимое от разных помощников не объединяется", () => {
  assert.equal(groupIncoming([ch("i1", "Мама", { birthYear: "1991" }), ch("i2", "Тётя", { birthYear: "1991" })]).length, 2);
});
test("Г4 порядок ключей и порядок правок не важны, лишняя правка делает предложение другим", () => {
  const a = ch("i1", "Мама", { birthYear: "1991", name: "Р" });
  const b = { ...ch("i2", "Мама", { name: "Р", birthYear: "1991" }) };
  assert.equal(groupIncoming([a, b]).length, 1);
  const more = ch("i3", "Мама", { birthYear: "1991", name: "Р" }, [{ key: "places", kind: "add", id: "p", after: { id: "p", name: "Тверь" } }]);
  assert.equal(groupIncoming([a, more]).length, 2);
});
test("Г5 не-правки (истории, фото) не группируются и порядок сохраняется", () => {
  const s = (id: string): Incoming => ({ id, kind: "story", at: 1, from: { name: "Мама", relation: "" }, title: "t", question: "", text: "x" });
  const g = groupIncoming([s("a"), ch("i1", "Мама", { birthYear: "1991" }), s("b"), ch("i2", "Мама", { birthYear: "1991" })]);
  assert.deepEqual(g.map((x) => x.ids), [["a"], ["i1", "i2"], ["b"]]);
});
