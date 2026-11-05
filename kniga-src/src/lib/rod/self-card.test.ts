// Правка заглушки «Я» в древе: создаётся настоящая запись «Я», связи с __self переезжают на неё.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};

const g = globalThis as unknown as Record<string, unknown>;
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", origin: "http://localhost" } };

g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };
