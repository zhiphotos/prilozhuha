import assert from "node:assert/strict";
import test from "node:test";
import { layoutBoheme, BOHEME_FRAME } from "./boheme.ts";
import { demoTree } from "./demo.ts";

test("boheme keeps every person and the frames do not stack", () => {
  const data = demoTree();
  const sheet = layoutBoheme(data.people, data.unions, data.focusId);
  assert.equal(sheet.nodes.length, data.people.length);
  assert.ok(sheet.vines.length > 3);
  for (let i = 0; i < sheet.nodes.length; i++) {
    const a = sheet.nodes[i]!;
    assert.ok(a.x > BOHEME_FRAME && a.x < sheet.width - BOHEME_FRAME);
    for (let j = i + 1; j < sheet.nodes.length; j++) {
      const b = sheet.nodes[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      assert.ok(dx * dx + dy * dy > (BOHEME_FRAME * 2 + 8) ** 2);
    }
  }
});
