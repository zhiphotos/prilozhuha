import assert from "node:assert/strict";
import test from "node:test";
import { SEARCH_LIMIT, bumpUsage, searchesLeft } from "./search-limit.ts";

test("лимит 10 в месяц и сброс в новом месяце", () => {
  const oct = new Date(2026, 9, 5);
  let usage = undefined as ReturnType<typeof bumpUsage> | undefined;
  assert.equal(searchesLeft(usage, oct), SEARCH_LIMIT);
  for (let i = 0; i < 10; i++) usage = bumpUsage(usage, oct);
  assert.equal(searchesLeft(usage, oct), 0);
  assert.equal(searchesLeft(usage, new Date(2026, 10, 1)), SEARCH_LIMIT);
});
