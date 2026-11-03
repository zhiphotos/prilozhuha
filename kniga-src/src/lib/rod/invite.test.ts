import assert from "node:assert/strict";
import test from "node:test";
import { INVITE_TEXT, TESTERS_CHAT_URL, copyText } from "./invite.ts";

const g = globalThis as unknown as Record<string, unknown>;
const reset = () => { delete g.navigator; delete g.document; };

test("ссылка на чат целиком, отдельной строкой, и запрошенные пункты на месте", () => {
  assert.equal(TESTERS_CHAT_URL, "https://t.me/+ZnvorYkuM9w1MjAy");
  assert.ok(INVITE_TEXT.split("\n").includes(TESTERS_CHAT_URL), "ссылка отдельной строкой без лишних символов");
  for (const part of ["Привет! ❤️", "Как начать:", "закреплённое сообщение", "инструкцию по установке", "создавать своё семейное древо", "Нам очень важна обратная связь! ❤️"]) assert.ok(INVITE_TEXT.includes(part), part);
  assert.ok(!INVITE_TEXT.includes("—"), "в тексте нет длинного тире");
});

test("copyText: Clipboard API получает полный текст", async () => {
  let got = "";
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async (t: string) => { got = t; } } }, configurable: true });
  assert.equal(await copyText(INVITE_TEXT), true);
  assert.equal(got, INVITE_TEXT);
  reset();
});

test("copyText: если Clipboard API отказал, срабатывает запасной способ с полным текстом", async () => {
  let selected = "";
  const area: Record<string, unknown> = { style: {}, setAttribute() {}, focus() {}, select() {}, setSelectionRange() {} };
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async () => { throw new Error("denied"); } } }, configurable: true });
  Object.defineProperty(globalThis, "document", { value: { createElement: () => area, body: { appendChild: () => { selected = String(area.value); }, removeChild() {} }, execCommand: () => true }, configurable: true });
  assert.equal(await copyText(INVITE_TEXT), true);
  assert.equal(selected, INVITE_TEXT);
  reset();
});

test("copyText: если не работает ничего, возвращает false (окно покажет подсказку)", async () => {
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  Object.defineProperty(globalThis, "document", { value: { createElement: () => { throw new Error("no dom"); } }, configurable: true });
  assert.equal(await copyText("x"), false);
  reset();
});
