import assert from "node:assert/strict";
import test from "node:test";
import { demoTree } from "./demo.ts";
import { TAIGA_FRAME, layoutTaiga } from "./taiga.ts";

test("taiga keeps generations downward and frames apart when the row grows wide", () => {
  const data = demoTree();
  const sheet = layoutTaiga(data.people, data.unions, data.focusId);
  assert.equal(sheet.nodes.length, data.people.length);
  const at = new Map(sheet.nodes.map((n) => [n.id, n]));
  assert.ok(at.get("anna")!.y > at.get("olga")!.y, "children sit below parents");
  assert.ok(sheet.vines.length > 3);
  for (let i = 0; i < sheet.nodes.length; i++) {
    const a = sheet.nodes[i]!;
    assert.ok(a.x > TAIGA_FRAME && a.y > TAIGA_FRAME);
    assert.ok(a.x < sheet.width - TAIGA_FRAME / 2 && a.y < sheet.height - 20);
    for (let j = i + 1; j < sheet.nodes.length; j++) {
      const b = sheet.nodes[j]!;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      assert.ok(dx * dx + dy * dy > (TAIGA_FRAME * 2 + 4) ** 2);
    }
  }
});
