import assert from "node:assert/strict";
import test from "node:test";
import { askGenealogist, aiStatus, quotaLine, type AiDeps } from "./ai-client.ts";

const deps = (reply: { status: number; body: unknown } | "throw"): AiDeps => ({
  apiBase: "https://api.example", token: "t", deviceId: "d",
  fetch: (async (_url: string, init: { body: string }) => {
    if (reply === "throw") throw new Error("offline");
    deps.last = JSON.parse(init.body);
    return { ok: reply.status < 400, status: reply.status, json: async () => reply.body };
  }) as unknown as typeof fetch,
});
deps.last = {} as Record<string, unknown>;

test("без токена запрос не уходит", async () => {
  const r = await aiStatus({ apiBase: "https://x", token: "", deviceId: "d" });
  assert.equal(r.ok, false);
});

test("вопрос уходит с токеном, устройством и requestId", async () => {
  const r = await askGenealogist(deps({ status: 200, body: { text: "ответ", left: 3, resetAt: "2026-11-04T21:00:00Z" } }), "Кто прадед?", "Анна", "r1");
  assert.equal(r.ok, true);
  assert.deepEqual([deps.last.token, deps.last.deviceId, deps.last.task, deps.last.requestId], ["t", "d", "genealogy_ask", "r1"]);
});

test("исчерпанный лимит приходит с кодом и датой, а не молчанием", async () => {
  const r = await askGenealogist(deps({ status: 429, body: { error: "Ваш лимит закончился.", code: "user_quota", resetAt: "2026-11-04T21:00:00Z" } }), "Кто прадед?", "", "r2");
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual([r.code, r.resetAt], ["user_quota", "2026-11-04T21:00:00Z"]);
});

test("нет связи: честное сообщение", async () => {
  const r = await aiStatus(deps("throw"));
  assert.equal(r.ok === false && r.code, "network");
});

test("строка остатка с датой обновления", () => {
  const line = quotaLine({ per: "month", limit: 10, used: 4, left: 6, resetAt: "2026-12-31T21:00:00Z" }, new Date("2026-11-15T12:00:00Z"));
  assert.match(line, /Осталось 6 из 10/);
  assert.match(line, /1 января/);
});
