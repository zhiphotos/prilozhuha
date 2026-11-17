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
ok("третья глава за день: лимит", r.status === 429);
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
