import assert from "node:assert/strict";
import test from "node:test";
import { demoTree } from "./demo.ts";
import { GZHEL_FRAME, layoutGzhel } from "./gzhel.ts";

test("gzhel keeps every person and the frames do not stack", () => {
  const data = demoTree();
  const sheet = layoutGzhel(data.people, data.unions, data.focusId);
  assert.equal(sheet.nodes.length, data.people.length);
  assert.ok(sheet.vines.length > 3);
  for (let i = 0; i < sheet.nodes.length; i++) {
    const a = sheet.nodes[i]!;
    assert.ok(a.x > GZHEL_FRAME && a.x < sheet.width - GZHEL_FRAME);
    for (let j = i + 1; j < sheet.nodes.length; j++) {
      const b = sheet.nodes[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      assert.ok(dx * dx + dy * dy > (GZHEL_FRAME * 2 + 8) ** 2);
    }
  }
});
