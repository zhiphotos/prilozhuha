import assert from "node:assert/strict";
import test from "node:test";
import { DATA_KEYS } from "./backup.ts";
import { mergeBooks } from "./sync-merge.ts";

test("чат с генеалогом и главы входят в данные книги и в облачное объединение", () => {
  assert.ok(DATA_KEYS.includes("aiChat" as never) && DATA_KEYS.includes("aiChapters" as never));
  const a = { aiChat: [{ id: "1", role: "user", text: "q", at: "2026-01-01" }], aiChapters: [{ id: "c1" }] };
  const b = { aiChat: [{ id: "2", role: "assistant", text: "a", at: "2026-01-02" }], aiChapters: [{ id: "c2" }] };
  const { data } = mergeBooks(a, b);
  assert.equal((data.aiChat as unknown[]).length, 2);
  assert.equal((data.aiChapters as unknown[]).length, 2);
});
