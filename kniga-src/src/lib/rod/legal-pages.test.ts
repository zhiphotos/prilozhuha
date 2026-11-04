import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LEGAL_DOCS, OPERATOR } from "./legal-docs.ts";

// Обычные страницы условий для банка (public/about, public/legal) собираются командой `npm run legal:pages`: тест ловит случай, когда текст документа поправили, а страницы не пересобрали.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const file = (rel: string) => new URL(`../../../public/${rel}`, import.meta.url);

test("страница «О сервисе» и список документов существуют", () => {
  assert.ok(existsSync(file("about/index.html")));
  assert.ok(existsSync(file("legal/index.html")));
});

test("у каждого документа есть обычная страница с полным текстом и реквизитами ИП", () => {
  for (const doc of LEGAL_DOCS.filter((d) => d.id !== "about")) {
    const path = file(`legal/${doc.id}/index.html`);
    assert.ok(existsSync(path), `нет страницы ${doc.id}`);
    const html = readFileSync(path, "utf8");
    for (const [kind, text] of doc.blocks) {
      if (kind === "p" || kind === "li" || kind === "h") assert.ok(html.includes(esc(text).slice(0, 60)), `страница ${doc.id} устарела: нет «${text.slice(0, 40)}…» (запустите npm run legal:pages)`);
    }
    assert.ok(html.includes(OPERATOR.inn) && html.includes(OPERATOR.ogrnip), `в ${doc.id} нет реквизитов`);
  }
});

test("«О сервисе» содержит цену, оплату, возврат и реквизиты, без JavaScript", () => {
  const html = readFileSync(file("about/index.html"), "utf8");
  const about = LEGAL_DOCS.find((d) => d.id === "about")!;
  for (const [kind, text] of about.blocks) if (kind !== "title") assert.ok(html.includes(esc(text).slice(0, 60)), `в about нет «${text.slice(0, 40)}»`);
  assert.ok(!/<script/i.test(html), "на странице не должно быть скриптов");
  for (const id of ["offer", "terms", "privacy", "consent-pd"]) assert.ok(html.includes(`legal/${id}/`), `нет ссылки на ${id}`);
});
