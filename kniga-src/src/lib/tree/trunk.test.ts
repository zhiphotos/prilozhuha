import assert from "node:assert/strict";
import test from "node:test";
import { childTrunk } from "@/lib/tree/trunk";

test("двое детей не по центру под родителями: линия уходит в середину перекладины между ними", () => {
  const parts = childTrunk(350, 100, 200, [218, 350]);
  assert.equal(parts[0], "M 350 100 V 150 H 284 V 200");
  assert.equal(parts[1], "M 218 200 H 350");
});

test("дети ровно под родителями: прямая линия без излома", () => {
  assert.deepEqual(childTrunk(300, 100, 200, [200, 400]), ["M 300 100 V 200", "M 200 200 H 400"]);
});

test("один ребёнок: как раньше", () => {
  assert.deepEqual(childTrunk(300, 100, 200, [300]), ["M 300 100 V 200"]);
  assert.deepEqual(childTrunk(300, 100, 200, [340]), ["M 300 100 V 200", "M 300 200 H 340"]);
});

test("древо вверх (дети выше родителей): излом на полпути", () => {
  assert.equal(childTrunk(500, 400, 300, [100, 200])[0], "M 500 400 V 350 H 150 V 300");
});
