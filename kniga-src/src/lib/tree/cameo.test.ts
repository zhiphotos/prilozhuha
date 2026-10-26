import assert from "node:assert/strict";
import test from "node:test";
import { layoutCameo, FRAME } from "./cameo.ts";
import { demoTree } from "./demo.ts";

test("cameo keeps every person and the portraits do not stack", () => {
  const data = demoTree();
  const sheet = layoutCameo(data.people, data.unions, data.focusId);
  assert.equal(sheet.nodes.length, data.people.length);
  assert.ok(sheet.vines.length > 3);
  for (let i = 0; i < sheet.nodes.length; i++) {
    const a = sheet.nodes[i]!;
    assert.ok(a.x > FRAME && a.x < sheet.width - FRAME, `${a.id} is off the page`);
    for (let j = i + 1; j < sheet.nodes.length; j++) {
      const b = sheet.nodes[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      assert.ok(dx * dx + dy * dy > (FRAME * 2 + 8) ** 2, `${a.id} overlaps ${b.id}`);
    }
  }
});
