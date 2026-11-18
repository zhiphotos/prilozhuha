import assert from "node:assert/strict";
import test from "node:test";
import { buildFragments } from "./interview-chapter.ts";
import type { InterviewFact } from "./types.ts";

const fact = (id: string, over: Partial<InterviewFact>): InterviewFact => ({ id, kind: "places", title: "Хутор", detail: "", relation: "", years: "", place: "", quote: "две линии домов", certainty: "ясно", note: "", review: "new", ...over });

test("фрагменты нумеруются, неверные скрыты, подтверждённые первыми", () => {
  const { text, sources } = buildFragments({ title: "Бабушка", facts: [fact("a", { title: "Новый" }), fact("b", { title: "Неверный", review: "wrong" }), fact("c", { title: "Подтверждённый", review: "confirmed" })] });
  const lines = text.split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^\[1\].*Подтверждённый/);
  assert.match(lines[1], /^\[2\].*Новый/);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].n, 1);
});

test("цитата дословная и обрезается, общий размер ограничен", () => {
  const many = Array.from({ length: 200 }, (_, i) => fact(String(i), { title: `Факт ${i}`, detail: "д".repeat(300), quote: "ц".repeat(500) }));
  const { text, sources } = buildFragments({ title: "x", facts: many });
  assert.ok(text.length <= 13600);
  assert.ok(sources.length < 200 && sources.length > 10);
  assert.ok(sources[0].quote.length <= 260);
});
