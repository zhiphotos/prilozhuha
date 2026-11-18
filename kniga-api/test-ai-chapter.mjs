// Проверка художественной главы на памяти и поддельном Cloudflare: `node test-ai-chapter.mjs`
process.env.MEMORY_STORE = "1"; process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
process.env.AI_ENABLED = "1"; process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok";
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const run = (handler, body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method: "POST", body, headers: { origin: "https://app.example" }, socket: {} }, res);
});
const { ROUTES } = await import("./lib/routes/index.js");
const { makeToken } = await import("./lib/token.js");
const A = makeToken({ order: "kr-5001", until: Date.now() + 86400000 });
let mode = "ok", lastBody = null;
globalThis.fetch = async (url, init) => {
  lastBody = JSON.parse(init.body);
  if (mode === "empty") return { status: 200, ok: true, json: async () => ({ success: true, result: { response: "" } }) };
  return { status: 200, ok: true, json: async () => ({ success: true, result: { response: "Платки\n\nГлава про бабушку.\n\nЗаметка: не хватило года." } }) };
};
const story = "Моя бабушка Елена торговала платками на рынке в Бендерах. Платки она получала от сестры из Одессы. Однажды у неё украли весь товар, и она осталась ни с чем, но не сдалась и начала сначала.";
const ask = (extra = {}) => run(ROUTES["ai-chapter"], { token: A, deviceId: "d1", requestId: Math.random().toString(36), text: story, style: "family", ...extra });
let r = await ask();
ok("глава приходит", r.status === 200 && /Платки/.test(r.json.chapter) && r.json.left === 1);
ok("в запросе есть стиль и рассказ, правило про факты в инструкции", /Тёплый семейный/.test(lastBody.messages[1].content) && /Бендерах/.test(lastBody.messages[1].content) && /не придумывай/.test(lastBody.messages[0].content));
ok("без токена отказ", (await run(ROUTES["ai-chapter"], { text: story, style: "family", requestId: "x" })).status === 401);
ok("неизвестный стиль отклонён", (await ask({ style: "hack" })).status === 400);
ok("слишком короткий текст отклонён", (await ask({ text: "Коротко" })).status === 400);
mode = "empty";
r = await ask();
ok("пустой ответ: ошибка, расход возвращён", r.status === 502 && (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.chapter.left === 1);
mode = "ok";
await ask(); r = await ask();
ok("после лимита в 2 единицы отказ", r.status === 429);
// Глава по интервью: длинный текст, свои правила, цена 2 единицы
const B = makeToken({ order: "kr-5002", until: Date.now() + 86400000 });
const frag = Array.from({ length: 40 }, (_, i) => `[${i + 1}] Место: Хутор. «Две линии домов по пять штук»`).join("\n");
r = await run(ROUTES["ai-chapter"], { token: B, deviceId: "d2", requestId: "iv1", text: frag, style: "interview" });
ok("глава по интервью принимается, правила про ссылки в инструкции", r.status === 200 && /\[3\]|ссылк|номера фрагментов/.test(lastBody.messages[0].content) && r.json.left === 0);
r = await run(ROUTES["ai-chapter"], { token: B, deviceId: "d2", requestId: "iv2", text: frag, style: "interview" });
ok("вторая глава по интервью в тот же день не проходит (стоит 2)", r.status === 429);
// Мини-рассказы по куску записи: JSON с рассказами, время эпизода, цена 1 единица
const C = makeToken({ order: "kr-5003", until: Date.now() + 86400000 });
const piece = "[00:12] Валя: Дядя Толя приехал на мотоцикле в Ростов к тёте Лиде.\n[00:40] Валя: Он привёз ей мешок картошки, и они долго пили чай на веранде.\n".repeat(4);
const fetchBefore = globalThis.fetch;
globalThis.fetch = async (url, init) => { lastBody = JSON.parse(init.body); return { status: 200, ok: true, json: async () => ({ success: true, result: { response: JSON.stringify({ stories: [{ title: "Дядя Толя в Ростове", text: "Дядя Толя приехал в Ростов на мотоцикле. ".repeat(6), at: "00:12", people: [{ name: "дядя Толя", relation: "брат" }, { name: "тётя Лида", relation: "" }], places: ["Ростов"] }] }) } }) }; };
r = await run(ROUTES["ai-chapter"], { token: C, deviceId: "d3", requestId: "st1", text: piece, style: "stories", wish: "Рассказывает Валя" });
ok("рассказы приходят с названием, временем, людьми и местами", r.status === 200 && r.json.stories?.[0]?.title === "Дядя Толя в Ростове" && r.json.stories[0].at === 12 && r.json.stories[0].people.length === 2 && r.json.stories[0].places[0] === "Ростов");
ok("в инструкции требование конкретного эпизода, а не пересказа", /ОДИН конкретный эпизод/.test(lastBody.messages[0].content) && /не пересказ/i.test(lastBody.messages[0].content));
ok("стоит 1 единицу", r.json.left === 1);
globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ success: true, result: { response: "просто текст" } }) });
r = await run(ROUTES["ai-chapter"], { token: C, deviceId: "d3", requestId: "st2", text: piece, style: "stories" });
ok("не-JSON: ошибка, расход возвращён", r.status === 502 && (await run(ROUTES["ai-status"], { token: C, deviceId: "d3" })).json.usage.chapter.left === 1);
globalThis.fetch = fetchBefore;
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
