// Проверка поиска по архивам с ИИ на памяти и поддельном Cloudflare: `node test-ai-seek.mjs`
process.env.MEMORY_STORE = "1"; process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
process.env.AI_ENABLED = "1"; process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok";
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const run = (handler, body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method: "POST", body, headers: { origin: "https://app.example" }, socket: {} }, res);
});
const { ROUTES } = await import("./lib/routes/index.js");
const { makeToken } = await import("./lib/token.js");
const A = makeToken({ order: "kr-4001", until: Date.now() + 86400000 });
const leads = [
  { title: "Национальный архив Молдовы", archive: "Национальный архив Молдовы", href: "https://arhiva.gov.md", query: "Балануца Фёдор", why: "Метрики Бессарабии.", grade: "A" },
  { title: "FamilySearch, каталог", archive: "FamilySearch", href: "https://www.familysearch.org/search/catalog", query: "Мулешты", why: "Сканы метрик.", grade: "A" },
];
let mode = "ok", lastBody = null;
globalThis.fetch = async (url, init) => {
  lastBody = JSON.parse(init.body);
  if (mode === "empty") return { status: 200, ok: true, json: async () => ({ success: true, result: { response: "не json" } }) };
  const reply = { summary: "Начните с Национального архива Молдовы.", leads: [{ href: "https://arhiva.gov.md", query: "Balanuță Teodor", why: "Метрики." }, { href: "https://evil.example", query: "x", why: "выдуманная ссылка" }], tips: ["Проверьте отчество и возраст."] };
  return { status: 200, ok: true, json: async () => ({ success: true, result: { response: JSON.stringify(reply) } }) };
};
const ask = (extra = {}) => run(ROUTES["ai-seek"], { token: A, deviceId: "d1", requestId: Math.random().toString(36), question: "Балануца Фёдор Семёнович, Бендерский уезд, ищем родителей", place: "Мулешты", seek: "parents", variants: ["Balanuță Teodor"], leads, ...extra });

let r = await ask();
ok("ответ приходит со сводкой и советами", r.status === 200 && r.json.summary && r.json.tips.length === 1);
ok("выдуманная ссылка отброшена, остался архив из списка", r.json.leads.length === 1 && r.json.leads[0].href === "https://arhiva.gov.md");
ok("в запросе к модели есть материалы базы знаний", /Материалы базы знаний/.test(lastBody.messages[1].content));
ok("без токена отказ", (await run(ROUTES["ai-seek"], { leads, question: "x", requestId: "x" })).status === 401);
ok("без списка архивов отказ", (await ask({ leads: [] })).status === 400);
mode = "empty";
const before = (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.archive.left;
r = await ask();
ok("непонятный ответ ИИ: ошибка и расход возвращён", r.status === 502 && (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.archive.left === before);
mode = "ok";
for (let i = 0; i < 12; i += 1) r = await ask();
ok("после 10 поисков в месяц лимит", r.status === 429);
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
