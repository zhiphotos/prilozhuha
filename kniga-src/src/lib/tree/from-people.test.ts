import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople, SELF_ID } from "./from-people.ts";
import { layoutTree } from "./layout.ts";

const base = { maidenName: "", notes: "", birthYear: "" };
test("люди встают на нужные линии", () => {
  const data = treeFromPeople([
    { ...base, id: "m", name: "Анна", relation: "мама" },
    { ...base, id: "f", name: "Иван", relation: "папа" },
    { ...base, id: "gm", name: "Нина", relation: "бабушка", line: "mom" },
    { ...base, id: "gd", name: "Пётр", relation: "дедушка", line: "dad" },
    { ...base, id: "u", name: "Олег", relation: "дядя", line: "mom" },
  ]);
  const parentsOf = (id: string) => data.unions.find((u) => u.childIds.includes(id))?.partnerIds ?? [];
  assert.deepEqual([...parentsOf(SELF_ID)].sort(), ["f", "m"]);
  assert.ok(parentsOf("m").includes("gm"));
  assert.ok(parentsOf("f").includes("gd") && parentsOf("f").length === 2);
  assert.ok(parentsOf("u").includes("gm"));
  assert.ok(layoutTree(data.people, data.unions, data.focusId).nodes.length >= 6);
});

test("запись «я» становится центром древа, без двойника", () => {
  const data = treeFromPeople([
    { ...base, id: "me", name: "Регина Богатурова", relation: "я", birthYear: "1998" },
    { ...base, id: "m", name: "Зульфира Усачева", relation: "мама" },
    { ...base, id: "f", name: "Алексей Усачев", relation: "папа" },
    { ...base, id: "s", name: "Ляйсан Усачева", relation: "сестра" },
  ]);
  assert.equal(data.focusId, "me");
  assert.ok(!data.people.some((p) => p.id === SELF_ID), "запасного «Я» быть не должно");
  assert.equal(data.people.length, 4);
  const parentsOf = (id: string) => data.unions.find((u) => u.childIds.includes(id))?.partnerIds ?? [];
  assert.deepEqual([...parentsOf("me")].sort(), ["f", "m"]);
  assert.deepEqual([...parentsOf("s")].sort(), ["f", "m"]);
});
