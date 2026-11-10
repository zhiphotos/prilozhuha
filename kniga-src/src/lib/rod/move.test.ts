import assert from "node:assert/strict";
import test from "node:test";
import { movedBase, movedHost, redirectTarget } from "./move.ts";

const NEW = "https://kniga-balanuca.ru/app/";
const ROOM = "0123456789ab";

test("приглашение помощника переносится на новый адрес вместе с ключом", () => {
  assert.equal(redirectTarget(NEW, `#/join/${ROOM}.abcdef-1`), `${NEW}#/join/${ROOM}.abcdef-1`);
});
test("ссылка на просмотр древа переносится", () => {
  assert.equal(redirectTarget(NEW, "#/view/0123456789abcdef"), `${NEW}#/view/0123456789abcdef`);
});
test("ссылка в раздел переносится", () => {
  assert.equal(redirectTarget(NEW, "#/go/lessons"), `${NEW}#/go/lessons`);
});
test("ключ доступа после оплаты переносится", () => {
  assert.equal(redirectTarget(NEW, "#kr-access=abc.def"), `${NEW}#kr-access=abc.def`);
  assert.equal(redirectTarget(NEW, "#paid=1&kr-access=abc.def"), `${NEW}#paid=1&kr-access=abc.def`);
});
test("обычное открытие и юридические страницы остаются на старом адресе", () => {
  assert.equal(redirectTarget(NEW, ""), null);
  assert.equal(redirectTarget(NEW, "#/legal/offer"), null);
  assert.equal(redirectTarget(NEW, "#/something"), null);
});
test("испорченное приглашение не переносится", () => {
  assert.equal(redirectTarget(NEW, "#/join/zz.abc"), null);
  assert.equal(redirectTarget(NEW, "#/view/123"), null);
});
test("на новом адресе (переезд не задан) ничего не переносится", () => {
  assert.equal(redirectTarget("", `#/join/${ROOM}.abcdef`), null);
});
test("адрес без слеша в конце получает слеш", () => {
  assert.equal(movedBase("https://kniga-balanuca.ru/app"), "https://kniga-balanuca.ru/app/");
  assert.equal(redirectTarget("https://kniga-balanuca.ru/app", "#/go/home"), "https://kniga-balanuca.ru/app/#/go/home");
});
test("название адреса для показа", () => {
  assert.equal(movedHost(NEW), "kniga-balanuca.ru/app");
});
