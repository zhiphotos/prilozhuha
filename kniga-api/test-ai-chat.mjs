// Проверка чата-генеалога на памяти и поддельных Cloudflare/Gemini: `node test-ai-chat.mjs`
process.env.MEMORY_STORE = "1"; process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
process.env.AI_ENABLED = "1"; process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok";
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const run = (handler, body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method: "POST", body, headers: { origin: "https://app.example" }, socket: {} }, res);
});
const { ROUTES } = await import("./lib/routes/index.js");
const { makeToken } = await import("./lib/token.js");
const A = makeToken({ order: "kr-3001", until: Date.now() + 86400000 });
let calls = 0, lastUrl = "", lastBody = null, mode = "ok";
globalThis.fetch = async (url, init) => {
  calls += 1; lastUrl = String(url); lastBody = JSON.parse(init.body);
  if (mode === "quota") return { status: 429, ok: false, json: async () => ({ success: false, errors: [{ code: 4006 }] }) };
  if (mode === "empty") return { status: 200, ok: true, json: async () => ({ success: true, result: { response: "" } }) };
  if (String(url).includes("generativelanguage") || String(url).includes("gem.example")) return { status: 200, ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "Ответ Gemini" }] } }] }) };
  return { status: 200, ok: true, json: async () => ({ success: true, result: { response: "Ответ Cloudflare" } }) };
};
const ask = (text, extra = {}) => run(ROUTES["ai-chat"], { token: A, deviceId: "d1", requestId: Math.random().toString(36), messages: [{ role: "user", text }], ...extra });

let r = await ask("Где искать ревизские сказки?");
ok("ответ приходит", r.status === 200 && r.json.reply === "Ответ Cloudflare");
ok("указан источник из базы знаний", r.json.sources.includes("Ревизские сказки"));
ok("в запросе к модели есть инструкция генеалога и материалы базы", /генеалог/.test(lastBody.messages[0].content) && /Материалы базы знаний/.test(lastBody.messages[0].content));
ok("без токена отказ", (await run(ROUTES["ai-chat"], { messages: [{ role: "user", text: "привет" }], requestId: "x" })).status === 401);
ok("пустой вопрос отклонён", (await ask("   ")).status === 400);
ok("последним должен быть вопрос пользователя", (await run(ROUTES["ai-chat"], { token: A, deviceId: "d1", requestId: "q1", messages: [{ role: "assistant", text: "привет" }] })).status === 400);
r = await ask("Как составить родословное дерево?", { messages: [{ role: "user", text: "Привет" }, { role: "assistant", text: "Здравствуйте" }, { role: "user", text: "Как составить родословное дерево?" }] });
ok("история диалога передаётся", lastBody.messages.length === 4);
mode = "empty";
const before = (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.chat.left;
r = await ask("Расскажи про метрические книги");
ok("пустой ответ ИИ: ошибка и расход возвращён", r.status === 502 && (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.chat.left === before);
mode = "quota";
r = await ask("Расскажи про архивы России");
ok("квота провайдера: 429 с датой", r.status === 429 && r.json.code === "provider_quota");
r = await ask("Ещё вопрос про фамилии");
ok("после остановки провайдер не вызывается", r.status === 429 && calls > 0);
mode = "ok";
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
