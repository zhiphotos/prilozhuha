import assert from "node:assert/strict";
import { test } from "node:test";
import { RATE, clock, encodeWav, findCuts, shiftSegments, toBase64 } from "./audio-chunks.ts";

test("WAV: заголовок и размер", () => {
  const wav = encodeWav(new Float32Array(RATE), RATE);
  assert.equal(wav.length, 44 + RATE * 2);
  assert.equal(String.fromCharCode(...wav.subarray(0, 4)), "RIFF");
  assert.equal(new DataView(wav.buffer).getUint32(24, true), RATE);
});

test("куски режутся в самом тихом месте рядом с минутой", () => {
  const sec = 150;
  const s = new Float32Array(sec * RATE).fill(0.5);
  // тишина на 58-й секунде
  s.fill(0, 58 * RATE, 58.3 * RATE);
  const cuts = findCuts(s);
  assert.ok(cuts[0]! >= 58 * RATE && cuts[0]! <= 58.3 * RATE, "первая граница в тишине");
  assert.equal(cuts[cuts.length - 1], s.length);
  let prev = 0;
  for (const c of cuts) {
    assert.ok(c - prev <= 65 * RATE, "кусок не длиннее 65 с");
    prev = c;
  }
});

test("короткая запись остаётся одним куском", () => {
  assert.deepEqual(findCuts(new Float32Array(30 * RATE)), [30 * RATE]);
});

test("отметки времени сдвигаются, время пишется как на часах", () => {
  assert.deepEqual(shiftSegments([{ start: 1, end: 2, text: "а" }], 60), [{ start: 61, end: 62, text: "а" }]);
  assert.equal(clock(75), "1:15");
  assert.equal(clock(3725), "1:02:05");
  assert.equal(toBase64(new Uint8Array([72, 105])), "SGk=");
});
