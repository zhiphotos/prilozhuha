import assert from "node:assert/strict";
import test from "node:test";
import { mentions, splitParts } from "./interview-stories.ts";

const segments = [
  { start: 0, end: 20, text: "Дядя Толя приехал на мотоцикле." },
  { start: 20, end: 50, text: "Тётя Лида жила в Ростове." },
  { start: 65, end: 90, text: "Потом толя уехал в Москву." },
];

test("части несут отметки времени и границы", () => {
  const parts = splitParts({ segments, text: "" });
  assert.equal(parts.length, 1);
  assert.match(parts[0].text, /^\[00:00\] Дядя Толя/);
  assert.match(parts[0].text, /\[01:05\] Потом/);
  assert.equal(parts[0].from, 0);
  assert.equal(parts[0].to, 90);
});

test("длинная запись режется на части не длиннее лимита", () => {
  const long = Array.from({ length: 400 }, (_, i) => ({ start: i * 5, end: i * 5 + 5, text: "Слово ".repeat(12) }));
  const parts = splitParts({ segments: long, text: "" });
  assert.ok(parts.length > 1 && parts.every((p) => p.chars <= 11600));
  assert.equal(parts[1].from, parts[0].to);
});

test("без отметок времени запись режется по абзацам", () => {
  const parts = splitParts({ segments: [], text: "Первый абзац.\nВторой абзац." });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].from, undefined);
});

test("где говорилось про человека: по имени в любом падеже, со временем", () => {
  const m = mentions({ segments, text: "" }, "дядя Толя");
  assert.deepEqual(m.map((x) => x.at), [0, 65]);
  const m2 = mentions({ segments: [], text: "Приехала Лида. Потом ничего. Про Лиду долго молчали." }, "Лида");
  assert.equal(m2.length, 2);
  assert.equal(m2[0].at, undefined);
});
