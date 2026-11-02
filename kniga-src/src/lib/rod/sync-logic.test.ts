import assert from "node:assert/strict";
import test from "node:test";
import { decideOpenCopy, decideSync, fingerprint, splitParts } from "./sync-logic.ts";

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

test("сценарии двух устройств", () => {
  // облачная новее, локальных правок нет
  assert.equal(decideSync({ cloudRev: 5, baseRev: 4, dirty: false }), "download");
  // офлайн: правки на этом устройстве, облако не менялось
  assert.equal(decideSync({ cloudRev: 4, baseRev: 4, dirty: true }), "upload");
  // менялось и там, и здесь: решает человек, ничего не теряется молча
  assert.equal(decideSync({ cloudRev: 6, baseRev: 4, dirty: true }), "conflict");
  // новое устройство с пустой книгой: берёт облако (dirty считается ложью), не затирает его
  assert.equal(decideSync({ cloudRev: 3, baseRev: 0, dirty: false }), "download");
});

test("«Открыть копию» не затирает более новое облако", () => {
  assert.equal(decideOpenCopy({ cloudRev: 0, baseRev: 0 }), "upload");
  assert.equal(decideOpenCopy({ cloudRev: 4, baseRev: 4 }), "upload");
  assert.equal(decideOpenCopy({ cloudRev: 7, baseRev: 4 }), "conflict");
  assert.equal(decideOpenCopy({ cloudRev: 2, baseRev: 0 }), "conflict");
});
