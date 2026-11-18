import assert from "node:assert/strict";
import test from "node:test";
import { ghostPosition, mergeGhosts } from "./spread.ts";
import type { PageBlock } from "./types.ts";

const b = (id: string, extra: Record<string, unknown> = {}) => ({ id, type: "sticker", kind: "heart", x: 0, y: 0, ...extra }) as unknown as PageBlock;

test("копия через разворот встаёт под нужным блоком", () => {
  const blocks = [b("photo"), b("text"), b("card")];
  assert.deepEqual(mergeGhosts(blocks, [b("g")]).map((x) => x.id), ["g", "photo", "text", "card"]);
  assert.deepEqual(mergeGhosts(blocks, [b("g", { ghostUnder: "text" })]).map((x) => x.id), ["photo", "g", "text", "card"]);
  assert.deepEqual(mergeGhosts(blocks, [b("g", { ghostUnder: null })]).map((x) => x.id), ["photo", "text", "card", "g"]);
});

test("если блок-якорь удалён, копия уходит вниз; позиция считается верно", () => {
  const blocks = [b("photo"), b("text")];
  assert.deepEqual(mergeGhosts(blocks, [b("g", { ghostUnder: "gone" })]).map((x) => x.id), ["g", "photo", "text"]);
  assert.equal(ghostPosition(blocks, "text"), 1);
  assert.equal(ghostPosition(blocks, null), 2);
  assert.equal(ghostPosition(blocks, undefined), 0);
});
