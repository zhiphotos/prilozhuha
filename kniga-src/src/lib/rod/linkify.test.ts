import assert from "node:assert/strict";
import test from "node:test";
import { splitLinks } from "./linkify.ts";

test("обычный текст остаётся одним куском", () => {
  assert.deepEqual(splitLinks("Родился в деревне"), [{ text: "Родился в деревне" }]);
});
test("ссылка в середине", () => {
  assert.deepEqual(splitLinks("см. https://example.org/a?b=1 дальше"), [{ text: "см. " }, { text: "https://example.org/a?b=1", href: "https://example.org/a?b=1" }, { text: " дальше" }]);
});
test("точка и запятая в конце не входят в ссылку", () => {
  const p = splitLinks("Смотри https://example.org/page.");
  assert.equal(p[1]?.href, "https://example.org/page");
  assert.equal(p[2]?.text, ".");
});
test("www без схемы получает https", () => {
  assert.equal(splitLinks("www.example.ru/x")[0]?.href, "https://www.example.ru/x");
});
test("скобка внутри ссылки остаётся, внешняя уходит", () => {
  assert.equal(splitLinks("(https://example.org/a)")[1]?.href, "https://example.org/a");
  assert.equal(splitLinks("https://example.org/a_(b)")[0]?.href, "https://example.org/a_(b)");
});
test("опасные схемы не становятся ссылками", () => {
  assert.ok(splitLinks("javascript:alert(1) data:text/html,x").every((p) => !p.href));
});
test("две ссылки подряд", () => {
  assert.equal(splitLinks("https://a.example.org и https://b.example.org").filter((p) => p.href).length, 2);
});
test("пустая строка", () => {
  assert.deepEqual(splitLinks(""), [{ text: "" }]);
});
