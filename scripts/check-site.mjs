// Проверка собранной папки сайта: в ней нет ничего лишнего и есть всё, на что ссылаются страницы.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

const root = resolve(process.argv[2] || "_site");
const errors = [];
const FORBIDDEN = ["kniga-api", "kniga-src", "docs", ".claude", "CLAUDE.md", "README.md", ".git", ".github", "scripts"];
for (const name of FORBIDDEN) if (existsSync(join(root, name))) errors.push(`в публикации лишнее: ${name}`);

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
const files = walk(root);
for (const f of files) {
  const rel = f.slice(root.length + 1);
  if (/(^|\/)\.env/.test(rel) || /\.(pem|key)$/.test(rel) || /\.(tsx?|mjs)$/.test(rel)) errors.push(`лишний файл: ${rel}`);
}

for (const page of files.filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(page, "utf8");
  for (const m of html.matchAll(/(?:src|href)="([^"#?]+)[^"]*"/g)) {
    const ref = m[1];
    if (/^(https?:|data:|mailto:|tel:|javascript:|\/\/)/.test(ref)) continue;
    const target = ref.startsWith("/") ? join(root, ref) : join(dirname(page), ref);
    const ok = existsSync(target) && (statSync(target).isFile() || existsSync(join(target, "index.html")));
    if (!ok) errors.push(`${page.slice(root.length + 1)}: нет файла ${ref}`);
  }
}
for (const must of ["kr-k3nu7rmszt/index.html", "kr-k3nu7rmszt/manifest.webmanifest", "kr-k3nu7rmszt/push-sw.js", "studio/index.html", "studio/data.json", "public/index.html"]) {
  if (!existsSync(join(root, must))) errors.push(`нет обязательного файла ${must}`);
}
if (errors.length) {
  console.error("Проверка сайта НЕ пройдена:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`Проверка сайта пройдена: ${files.length} файлов, лишнего нет, ссылки страниц целы.`);
