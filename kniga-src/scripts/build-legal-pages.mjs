// Обычные страницы с условиями без JavaScript: банку-эквайеру нужен текст прямо на сайте (как «О сервисе» у Кики).
// Источник один: src/lib/rod/legal-docs.ts. Запуск: npm run legal:pages  (файлы пишутся в public/about и public/legal, их проверяет тест).
// Пути между страницами относительные, поэтому работает и на корне домена, и в подпапке GitHub Pages.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { LEGAL_DOCS, LEGAL_DATE, OPERATOR } = await import(join(root, "src/lib/rod/legal-docs.ts"));

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// ссылки в тексте (https://…) делаем кликабельными
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" rel="noopener">$1</a>');

function body(blocks) {
  let html = "";
  let list = false;
  const close = () => {
    if (list) html += "</ul>\n";
    list = false;
  };
  for (const [kind, text] of blocks) {
    if (kind === "li") {
      if (!list) html += "<ul>\n";
      list = true;
      html += `<li>${linkify(text)}</li>\n`;
      continue;
    }
    close();
    if (kind === "title") html += `<h1>${esc(text)}</h1>\n`;
    else if (kind === "h") html += `<h2>${esc(text)}</h2>\n`;
    else html += `<p>${linkify(text)}</p>\n`;
  }
  close();
  return html;
}

const CSS = `body{margin:0;background:#f6f2e9;color:#1c1a16;font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:720px;margin:0 auto;padding:24px 20px 56px}nav{font-size:14px;margin-bottom:18px}
a{color:#3f4a22}h1{font-size:28px;line-height:1.2;margin:.2em 0 .5em}h2{font-size:19px;margin:1.6em 0 .4em}
ul{padding-left:1.2em}li{margin:.25em 0}footer{margin-top:40px;padding-top:16px;border-top:1px solid #1c1a1622;font-size:13px;color:#555}`;

function page({ title, depth, inner }) {
  const up = "../".repeat(depth);
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Книга рода</title>
<style>${CSS}</style>
</head>
<body>
<main>
<nav><a href="${up}">← В приложение «Книга рода»</a> · <a href="${up}about/">О сервисе</a> · <a href="${up}legal/">Все документы</a></nav>
${inner}
<footer>${esc(OPERATOR.name)}, ОГРНИП ${esc(OPERATOR.ogrnip)}, ИНН ${esc(OPERATOR.inn)}. ${esc(OPERATOR.address)}. Почта: <a href="mailto:${esc(OPERATOR.email)}">${esc(OPERATOR.email)}</a>. Редакция документов от ${esc(LEGAL_DATE)}.</footer>
</main>
</body>
</html>
`;
}

function write(rel, html) {
  const file = join(root, "public", rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

const docsList = (depth) =>
  `<h2>Документы</h2>\n<ul>\n${LEGAL_DOCS.filter((d) => d.id !== "about")
    .map((d) => `<li><a href="${"../".repeat(depth)}legal/${d.id}/">${esc(d.title)}</a>: ${esc(d.short)}</li>`)
    .join("\n")}\n</ul>\n`;

for (const doc of LEGAL_DOCS) {
  if (doc.id === "about") continue;
  write(`legal/${doc.id}/index.html`, page({ title: doc.title, depth: 2, inner: body(doc.blocks) }));
}
const about = LEGAL_DOCS.find((d) => d.id === "about");
write("about/index.html", page({ title: about.title, depth: 1, inner: body(about.blocks) + docsList(1) }));
write(
  "legal/index.html",
  page({ title: "Документы", depth: 1, inner: `<h1>Документы «Книги рода»</h1>\n<p>Правила, оплата и защита данных.</p>\n<ul>\n${LEGAL_DOCS.map((d) => `<li><a href="${d.id === "about" ? "../about/" : `${d.id}/`}">${esc(d.title)}</a>: ${esc(d.short)}</li>`).join("\n")}\n</ul>\n` }),
);
console.log(`Страницы условий: ${LEGAL_DOCS.length - 1} документов, about и список`);
