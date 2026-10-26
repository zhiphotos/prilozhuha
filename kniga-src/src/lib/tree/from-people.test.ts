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
  assert.deepEqual(parentsOf("m"), ["gm"]);
  assert.deepEqual(parentsOf("f"), ["gd"]);
  assert.deepEqual(parentsOf("u"), ["gm"]);
  assert.ok(layoutTree(data.people, data.unions, data.focusId).nodes.length >= 6);
});
