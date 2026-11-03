import assert from "node:assert/strict";
import test from "node:test";
import { describeFailure, newRequestId, resetWords } from "./ai-helper-state.ts";

const fail = (over: Record<string, unknown>) => ({ ok: false as const, status: 500, code: "error", message: "m", ...over });
const now = new Date("2026-11-04T10:00:00Z");

test("выключено: мягкое сообщение без слов про ошибку", () => {
  const f = describeFailure(fail({ status: 503, code: "disabled" }), now);
  assert.equal(f.kind, "soft");
  assert.ok(!/ошибк/i.test(f.title + f.text));
});

test("лимит: с датой обновления", () => {
  const f = describeFailure(fail({ status: 429, code: "user_quota", resetAt: "2026-11-04T21:00:00Z" }), now);
  assert.equal(f.kind, "limit");
  assert.match(f.text, /завтра/);
  const month = describeFailure(fail({ status: 429, code: "user_quota", resetAt: "2026-12-31T21:00:00Z" }), now);
  assert.match(month.text, /января/);
});

test("общая квота: личные вопросы не потрачены", () => {
  assert.match(describeFailure(fail({ status: 429, code: "global_quota", resetAt: "2026-11-04T21:00:00Z" }), now).text, /не потрачены/);
});

test("нет доступа, нет сети, сбой", () => {
  assert.equal(describeFailure(fail({ status: 401 }), now).kind, "access");
  assert.equal(describeFailure(fail({ status: 0, code: "network", message: "Нет связи с сервером." }), now).kind, "offline");
  assert.equal(describeFailure(fail({ status: 502 }), now).kind, "error");
});

test("resetWords и номера вопросов", () => {
  assert.equal(resetWords(undefined), "");
  assert.equal(resetWords("2026-11-04T09:00:00Z", now), "скоро");
  assert.notEqual(newRequestId(), newRequestId());
});
