import assert from "node:assert/strict";
import { test } from "node:test";
import { interviewFromHash, interviewLink, interviewMessage, questionFromHash, questionLink, questionMessage } from "./ask-link.ts";

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

test("интервью: колода, шаблон и своё читаются из ссылки обратно", () => {
  Object.assign(globalThis, { window: { location: { origin: "https://kniga-balanuca.ru", pathname: "/app/" } } });
  const room = { id: "abcdef123456", inviteKey: "key-123456" };
  const deck = interviewLink(room, { kind: "deck", id: "kin", idx: [5, 1, 1, 3] });
  assert.deepEqual(interviewFromHash(deck.slice(deck.indexOf("#"))), { kind: "deck", id: "kin", idx: [1, 3, 5] });
  const tpl = interviewLink(room, { kind: "tpl", id: "first-love", idx: [] });
  assert.deepEqual(interviewFromHash(tpl.slice(tpl.indexOf("#"))), { kind: "tpl", id: "first-love", idx: [] });
  const own = interviewLink(room, { kind: "custom", id: "0123456789", idx: [] });
  assert.deepEqual(interviewFromHash(own.slice(own.indexOf("#"))), { kind: "custom", id: "0123456789", idx: [] });
  assert.equal(interviewFromHash("#/join/abcdef123456.key-123456"), null);
  assert.equal(interviewFromHash("#/join/abcdef123456.key-123456?d=kin&i=x.y"), null);
});

test("интервью: не больше 30 вопросов в ссылке и склонение в сообщении", () => {
  Object.assign(globalThis, { window: { location: { origin: "https://x", pathname: "/app/" } } });
  const link = interviewLink({ id: "abcdef123456", inviteKey: "key-123456" }, { kind: "deck", id: "kin", idx: Array.from({ length: 50 }, (_, i) => i) });
  assert.equal(interviewFromHash(link.slice(link.indexOf("#")))!.idx.length, 30);
  assert.match(interviewMessage("Про деда", 1, "L"), /1 вопрос\./);
  assert.match(interviewMessage("Про деда", 3, "L"), /3 вопроса\./);
  assert.match(interviewMessage("Про деда", 12, "L"), /12 вопросов\./);
});
