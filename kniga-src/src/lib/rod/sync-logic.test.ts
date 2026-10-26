import assert from "node:assert/strict";
import test from "node:test";
import { decideSync, fingerprint, splitParts } from "./sync-logic.ts";

test("решение синхронизации", () => {
  assert.equal(decideSync({ cloudRev: 0, baseRev: 0, dirty: false }), "upload");
  assert.equal(decideSync({ cloudRev: 3, baseRev: 3, dirty: false }), "same");
  assert.equal(decideSync({ cloudRev: 3, baseRev: 3, dirty: true }), "upload");
  assert.equal(decideSync({ cloudRev: 4, baseRev: 3, dirty: false }), "download");
  assert.equal(decideSync({ cloudRev: 4, baseRev: 3, dirty: true }), "conflict");
});

test("куски и отпечаток", () => {
  assert.deepEqual(splitParts("abcdef", 4), ["abcd", "ef"]);
  assert.deepEqual(splitParts("", 4), [""]);
  assert.equal(fingerprint("a"), fingerprint("a"));
  assert.notEqual(fingerprint("a"), fingerprint("b"));
});
