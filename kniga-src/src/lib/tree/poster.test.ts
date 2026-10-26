import assert from "node:assert/strict";
import test from "node:test";
import { demoTree } from "./demo.ts";
import { layoutPoster } from "./poster.ts";

test("living tree keeps every person and the cards do not stack", () => {
  const data = demoTree();
  const poster = layoutPoster(data.people, data.unions, data.focusId);
  assert.equal(poster.nodes.length, data.people.length);
  assert.ok(poster.links.length > 3);
  assert.ok(poster.rings.length > 0);
  assert.ok(poster.title.length > 1);
  for (const node of poster.nodes) {
    assert.ok(node.x > node.w / 2 && node.x < poster.width - node.w / 2, `${node.id} is off the sheet`);
  }
  for (let i = 0; i < poster.nodes.length; i++) {
    for (let j = i + 1; j < poster.nodes.length; j++) {
      const a = poster.nodes[i]!;
      const b = poster.nodes[j]!;
      const overlapX = Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 4;
      const overlapY = Math.abs(a.y - b.y) < poster.cardH - 4;
      assert.ok(!(overlapX && overlapY), `${a.id} overlaps ${b.id}`);
    }
  }
});
