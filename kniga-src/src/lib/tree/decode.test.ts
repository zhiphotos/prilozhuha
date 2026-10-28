import { decodeText } from "./decode.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}
const sample = "0 HEAD\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Надежда /Ёжкина/\n";
const buf = (view: Uint8Array) => view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;

assert(decodeText(buf(new TextEncoder().encode(sample))) === sample, "utf-8");
assert(decodeText(buf(new TextEncoder().encode("﻿" + sample))).includes("Надежда"), "utf-8 bom");
const u16 = new Uint8Array(2 + sample.length * 2);
u16[0] = 0xff;
u16[1] = 0xfe;
for (let i = 0; i < sample.length; i++) {
  const c = sample.charCodeAt(i);
  u16[2 + i * 2] = c & 255;
  u16[3 + i * 2] = c >> 8;
}
assert(decodeText(buf(u16)) === sample, "utf-16 bom");
const noBom = u16.subarray(2);
assert(decodeText(buf(noBom)) === sample, "utf-16 без метки");
// Windows-1251: «Надежда Ёжкина»
const cp = [0x30, 0x20, 0x48, 0x45, 0x41, 0x44, 0x0a, 0x31, 0x20, 0x4e, 0x41, 0x4d, 0x45, 0x20, 0xcd, 0xe0, 0xe4, 0xe5, 0xe6, 0xe4, 0xe0, 0x20, 0x2f, 0xc5, 0xe6, 0xea, 0xe8, 0xed, 0xe0, 0x2f, 0x0a];
assert(decodeText(buf(new Uint8Array(cp))).includes("Надежда /Ежкина/".replace("Е", "Е")), "windows-1251");
