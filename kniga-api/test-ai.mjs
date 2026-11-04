// Проверка ИИ-слоя на памяти вместо базы и поддельном Cloudflare: `node test-ai.mjs`
process.env.MEMORY_STORE = "1"; process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const run = (handler, body, method = "POST") => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method, body, headers: { origin: "https://app.example" }, socket: {} }, res);
});
const { ROUTES } = await import("./lib/routes/index.js");
const { makeToken } = await import("./lib/token.js");
const { redis } = await import("./lib/redis.js");
const { period, reserve } = await import("./lib/ai/quota.js");
const { limits } = await import("./lib/ai/limits.js");
const { ownerOf } = await import("./lib/ai/access.js");
const tok = (order, until = Date.now() + 86400000) => makeToken({ order, until });
const A = tok("kr-1001"), B = tok("kr-2002");
const ask = (token, extra = {}) => run(ROUTES["ai-run"], { token, deviceId: "d1", task: "genealogy_ask", requestId: Math.random().toString(36), input: { question: "Кто прадед Анны?", context: "Анна, 1980" }, ...extra });

// Cloudflare-подделка
let cfCalls = 0, cfMode = "ok";
globalThis.fetch = async () => { cfCalls += 1; return cfMode === "quota" ? { status: 429, ok: false, json: async () => ({ success: false, errors: [{ code: 4006 }] }) } : cfMode === "fail" ? { status: 500, ok: false, json: async () => ({}) } : { status: 200, ok: true, json: async () => ({ success: true, result: { response: "В книге нет данных о прадеде." } }) }; };

// доступ
ok("без токена 401", (await run(ROUTES["ai-status"], {})).status === 401);
ok("подделанный токен 401", (await run(ROUTES["ai-status"], { token: A.slice(0, -3) + "xxx" })).status === 401);
ok("просроченный токен 401", (await run(ROUTES["ai-status"], { token: tok("kr-1", Date.now() - 1) })).status === 401);
ok("GET запрещён", (await run(ROUTES["ai-status"], {}, "GET")).status === 405);
ok("отозванный личный код 401", (await run(ROUTES["ai-status"], { token: tok("grant-ZZ") })).status === 401);
await redis("HSET", "kr:grants", "ZZ", "1");
ok("действующий личный код 200", (await run(ROUTES["ai-status"], { token: tok("grant-ZZ") })).status === 200);
ok("владелец стабилен и не равен order", ownerOf("kr-1001") === ownerOf("kr-1001") && ownerOf("kr-1001") !== ownerOf("kr-2002") && !ownerOf("kr-1001").includes("1001"));

// выключено по умолчанию
let r = await ask(A);
ok("по умолчанию ИИ выключен (нет трат)", r.status === 503 && r.json.code === "disabled" && cfCalls === 0);
process.env.AI_ENABLED = "1";
r = await ask(A);
ok("без ключей провайдера: не подключено", r.status === 503 && r.json.code === "not_configured" && cfCalls === 0);
process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok";

// успех, остаток, статус
r = await ask(A);
ok("ответ получен, остаток 19", r.status === 200 && r.json.text.includes("нет данных") && r.json.left === 19 && r.json.resetAt);
let st = await run(ROUTES["ai-status"], { token: A, deviceId: "d1" });
ok("статус показывает остаток и дату", st.json.enabled && st.json.usage.text.left === 19 && st.json.usage.text.resetAt && st.json.available.text === true && st.json.available.audio_min === false);
ok("другой владелец не видит чужой расход", (await run(ROUTES["ai-status"], { token: B, deviceId: "d1" })).json.usage.text.used === 0);

// повтор и клиентский ввод
const dup = { requestId: "same-1" };
await ask(A, dup);
ok("повтор того же requestId отклонён", (await ask(A, dup)).status === 409);
ok("неизвестная задача отклонена", (await ask(A, { task: "free_chat" })).status === 400);
ok("слишком короткий вопрос отклонён", (await ask(A, { input: { question: "?" } })).status === 400);

// личный лимит
process.env.AI_LIMITS = JSON.stringify({ text: { per: "day", user: 3, global: 100 } });
await redis("DEL", "x");
const C = tok("kr-3003"); let last;
for (let i = 0; i < 4; i += 1) last = await ask(C);
ok("4-й запрос при лимите 3: отказ с датой", last.status === 429 && last.json.code === "user_quota" && last.json.resetAt);
const callsBefore = cfCalls; await ask(C); ok("после отказа новых вызовов провайдеру нет", cfCalls === callsBefore);

// общий лимит
process.env.AI_LIMITS = JSON.stringify({ text: { per: "day", user: 50, global: 1 } });
const D = tok("kr-4004"), E = tok("kr-5005");
const g1 = await ask(D), g2 = await ask(E);
ok("общий потолок: второй покупатель остановлен", g1.status === 429 || g2.status === 429);
const g = g1.status === 429 ? g1 : g2; ok("общий отказ называет общий лимит", g.json.code === "global_quota");

// сбой провайдера возвращает расход
process.env.AI_LIMITS = JSON.stringify({ text: { per: "day", user: 5, global: 100 } });
cfMode = "fail"; const F = tok("kr-6006");
r = await ask(F); ok("сбой провайдера: 502", r.status === 502);
cfMode = "ok"; r = await ask(F); ok("лимит после сбоя не потрачен (4 из 5)", r.status === 200 && r.json.left === 4);

// квота провайдера: остановка без перехода на что-то ещё
cfMode = "quota"; r = await ask(F);
ok("квота Cloudflare: 429 и дата", r.status === 429 && r.json.code === "provider_quota" && r.json.resetAt);
cfMode = "ok"; const n = cfCalls; r = await ask(F);
ok("после исчерпания провайдер больше не вызывается до сброса", r.status === 429 && cfCalls === n);

// периоды и настройки
const p = period("day", Date.UTC(2026, 10, 3, 22, 0)); // 01:00 по Москве 4 ноября
ok("день по Москве, сброс в полночь МСК", p.id === "d2026-11-4" && p.resetAt === "2026-11-04T21:00:00.000Z");
ok("месяц сбрасывается 1-го по МСК", period("month", Date.UTC(2026, 10, 15, 12, 0)).resetAt === "2026-11-30T21:00:00.000Z");
ok("кривой AI_LIMITS не ломает значения", (process.env.AI_LIMITS = "{не json", limits().text.user === 20));
const big = await reserve("o", "audio_min", 301, Date.now(), { AI_LIMITS: "" });
ok("минуты аудио считаются по факту, а не как один запрос", big.ok === false && big.scope === "user");
// /api/layout: доступ, выключатель, лимиты; до платного провайдера без доступа дело не доходит
{
  const layoutText = "Дом на Еловой\n\nДом стоял на краю деревни. Зимой его заносило по окна, и дед откапывал крыльцо лопатой.";
  const L = (extra, method = "POST") => run(ROUTES["layout"], { text: layoutText, ...extra }, method);
  const savedFetch = globalThis.fetch; let calls = 0;
  const reply = { items: [{ kind: "heading", text: "Дом на Еловой" }, { kind: "body", text: "Дом стоял на краю деревни. Зимой его заносило по окна, и дед откапывал крыльцо лопатой." }] };
  globalThis.fetch = async () => { calls += 1; return { json: async () => ({ choices: [{ message: { content: JSON.stringify(reply) } }] }) }; };
  process.env.AI_API_KEY = "k"; process.env.AI_ENABLED = "1";
  const before = () => calls;
  let n = before();
  ok("layout: без токена 401, провайдер не вызван", (await L({})).status === 401 && calls === n);
  ok("layout: подделанный токен 401, провайдер не вызван", (await L({ token: A.slice(0, -3) + "xxx", deviceId: "d1" })).status === 401 && calls === n);
  ok("layout: просроченный токен 401, провайдер не вызван", (await L({ token: tok("kr-9", Date.now() - 1), deviceId: "d1" })).status === 401 && calls === n);
  ok("layout: отозванный личный код 401, провайдер не вызван", (await L({ token: tok("grant-GONE"), deviceId: "d1" })).status === 401 && calls === n);
  ok("layout: GET запрещён, провайдер не вызван", (await L({ token: A, deviceId: "d1" }, "GET")).status === 405 && calls === n);
  ok("layout: короткий текст 400, провайдер не вызван", (await run(ROUTES["layout"], { text: "мало", token: A, deviceId: "d1" })).status === 400 && calls === n);
  process.env.AI_ENABLED = "0";
  ok("layout: выключатель ИИ 503, провайдер не вызван", (await L({ token: A, deviceId: "d1" })).status === 503 && calls === n);
  process.env.AI_ENABLED = "1";
  const good = await L({ token: A, deviceId: "d1" });
  ok("layout: действующий токен работает и тратит один запрос", good.status === 200 && good.json.items.length === 2 && calls === n + 1);
  // исчерпать личный дневной лимит и убедиться, что провайдер больше не вызывается
  const lim = limits().text.user;
  const other = tok("kr-7007");
  let last = null;
  for (let i = 0; i < lim + 2; i += 1) last = await L({ token: other, deviceId: "d7" });
  ok("layout: после личного лимита 429", last.status === 429 && last.json.code === "user_quota");
  const stop = calls;
  await L({ token: other, deviceId: "d7" });
  ok("layout: после лимита провайдер не вызывается", calls === stop);
  // ответ ИИ изменил текст: запрос возвращается в лимит
  globalThis.fetch = async () => ({ json: async () => ({ choices: [{ message: { content: JSON.stringify({ items: [{ kind: "body", text: "совсем другой текст про другое" }] }) } }] }) });
  const third = tok("kr-8008"); const owner = ownerOf("kr-8008");
  const bad = await L({ token: third, deviceId: "d8" });
  const left = await redis("GET", `kr:ai:u:${owner}:text:${period("day").id}`);
  ok("layout: изменённый текст 422 и лимит возвращён", bad.status === 422 && Number(left ?? 0) === 0);
  globalThis.fetch = savedFetch;
}

// публичные маршруты: суточный потолок с одного адреса
{
  const hit = (name, extra = {}) => new Promise((resolve) => {
    const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
    ROUTES[name]({ method: "POST", body: { email: "a@b.ru", consent: true, ...extra }, headers: { origin: "https://app.example", "x-forwarded-for": "203.0.113.9" }, socket: {} }, res);
  });
  let status = 0;
  for (let i = 0; i < 31; i += 1) status = (await hit("lead")).status;
  ok("lead: после 30 обращений с адреса 429", status === 429);
  ok("lead: другой адрес не задет", (await new Promise((resolve) => { const res = { statusCode: 200, setHeader() {}, end(t) { resolve(this.statusCode); } }; ROUTES["lead"]({ method: "POST", body: { email: "c@d.ru", consent: true }, headers: { origin: "https://app.example", "x-forwarded-for": "198.51.100.4" }, socket: {} }, res); })) === 200);
}
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
