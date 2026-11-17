import assert from "node:assert/strict";
import { test } from "node:test";
import { questionFromHash, questionLink, questionMessage } from "./ask-link.ts";

test("вопрос уходит в ссылку и читается обратно", () => {
  Object.assign(globalThis, { window: { location: { origin: "https://kniga-balanuca.ru", pathname: "/app/" } } });
  const q = "Как звали вашу прабабушку? Что о ней рассказывали & помнили?";
  const link = questionLink({ id: "abcdef123456", inviteKey: "key-123456" }, q);
  assert.match(link, /#\/join\/abcdef123456\.key-123456\?q=/);
  assert.equal(questionFromHash(link.slice(link.indexOf("#"))), q);
  assert.match(link.slice(link.indexOf("#")), /^#\/join\/([0-9a-f]{12})\.([\w-]{6,})/);
});

test("пустой и битый адрес без вопроса", () => {
  assert.equal(questionFromHash("#/join/abcdef123456.key-123456"), "");
  assert.equal(questionFromHash("#/join/abcdef123456.key-123456?q=%E0%A4%A"), "");
});

test("в сообщении есть вопрос и ссылка", () => {
  const m = questionMessage("Кто это на фото?", "https://x/#/join/a.b?q=1");
  assert.ok(m.includes("«Кто это на фото?»") && m.includes("https://x/#/join/a.b?q=1"));
  assert.ok(!m.includes("—"));
});
