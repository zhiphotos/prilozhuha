// Проверка поиска фактов в интервью на памяти и поддельном Cloudflare: `node test-ai-facts.mjs`
process.env.MEMORY_STORE = "1"; process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const run = (handler, body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method: "POST", body, headers: { origin: "https://app.example" }, socket: {} }, res);
});
const { ROUTES } = await import("./lib/routes/index.js");
const { makeToken } = await import("./lib/token.js");
const { parseModelJson, sanitizeFacts } = await import("./lib/ai/facts.js");
const A = makeToken({ order: "kr-2001", until: Date.now() + 86400000 });
const TEXT = "Мою бабушку звали Анна Петровна, она родилась в деревне Сосновка в тысяча девятьсот двадцатом году. Дедушка Иван работал кузнецом. Потом они переехали в Тулу, в дом на улице Ленина. Он потом вернулся, а кто он, я не помню точно.";
let calls = 0, mode = "ok", lastBody = null;
const good = { facts: [
  { kind: "people", title: "Анна Петровна", relation: "бабушка рассказчика", years: null, place: "Сосновка", quote: "Мою бабушку звали Анна Петровна", certainty: "ясно", note: null },
  { kind: "places", title: "Сосновка", quote: "в деревне Сосновка", certainty: "ясно" },
  { kind: "occupations", title: "Кузнец", detail: "Иван", quote: "Дедушка Иван работал кузнецом", certainty: "ясно" },
  { kind: "events", title: "Переезд в Мойву", quote: "Они переехали в Мойву на машине", certainty: "ясно" },
  { kind: "unclear", title: "Кто вернулся", detail: "Не сказано, кто «он»", quote: "а кто он, я не помню точно", certainty: "ясно" },
  { kind: "people", title: "Фёкла", quote: "бабушку звали анна  петровна", certainty: "ясно" },
] };
let reply = JSON.stringify(good);
globalThis.fetch = async (url, init) => {
  calls += 1; lastBody = JSON.parse(init.body);
  if (mode === "quota") return { status: 429, ok: false, json: async () => ({ success: false, errors: [{ code: 4006 }] }) };
  if (mode === "fail") return { status: 500, ok: false, json: async () => ({}) };
  return { status: 200, ok: true, json: async () => ({ success: true, result: { response: reply } }) };
};
const call = (extra = {}) => run(ROUTES["ai-facts"], { token: A, deviceId: "d1", requestId: Math.random().toString(36), text: TEXT, ...extra });
const left = async () => (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.facts.left;

ok("без токена 401 (только платным)", (await run(ROUTES["ai-facts"], { text: TEXT })).status === 401);
let r = await call();
ok("по умолчанию выключено", r.status === 503 && r.json.code === "disabled" && calls === 0);
process.env.AI_ENABLED = "1";
r = await call();
ok("без ключей: не подключено", r.status === 503 && r.json.code === "not_configured" && calls === 0);
process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok";
ok("слишком короткий и слишком длинный текст отклонены", (await call({ text: "коротко" })).status === 400 && (await call({ text: "а".repeat(10000) })).status === 400);
r = await call();
ok("валидный JSON: факты вернулись, остаток уменьшился", r.status === 200 && r.json.facts.length === 5 && r.json.left === 299);
const kinds = r.json.facts.map((f) => f.title);
ok("факт с несуществующей цитатой отброшен", !kinds.includes("Переезд в Мойву") && r.json.dropped === 1);
ok("цитата с другими пробелами и регистром принята", kinds.includes("Фёкла"));
const fekla = r.json.facts.find((f) => f.title === "Фёкла");
ok("имя, которого нет в тексте, помечено «неясно» с заметкой", fekla && fekla.certainty === "неясно" && fekla.note.length > 0);
const unclear = r.json.facts.find((f) => f.kind === "unclear");
ok("неясное остаётся неясным", unclear && unclear.certainty === "неясно");
ok("в запросе к модели есть жёсткие правила и текст", /ТОЛЬКО то, что сказано/.test(lastBody.messages[0].content) && lastBody.messages[1].content.includes("Анна Петровна") && lastBody.max_tokens >= 1500);
// обрамлённый ответ и обрезанный
reply = "Вот ответ:\n```json\n" + JSON.stringify(good) + "\n```";
ok("JSON в ``` и с лишними словами разбирается", (await call()).json.facts.length === 5);
reply = '{"facts":[{"kind":"places","title":"Сосновка","quote":"в деревне Сосновка","certainty":"ясно"},{"kind":"places","title":"Туд';
ok("обрезанный ответ: целые факты сохраняются", (await call()).json.facts.length === 1);
reply = "извините, не могу";
const before = await left();
r = await call();
ok("мусор вместо JSON: 502 и расход возвращён", r.status === 502 && r.json.code === "bad_json" && (await left()) === before);
reply = JSON.stringify({ facts: [{ kind: "places", title: "Сосновка", quote: "в деревне Сосновка" }, { kind: "places", title: "Сосновка", quote: "в деревне Сосновка" }, { kind: "ерунда", title: "x", quote: "в деревне Сосновка" }, { kind: "places", title: "Тула", quote: "" }] });
r = await call();
ok("дубли, неизвестный вид и пустая цитата чистятся", r.json.facts.length === 1 && r.json.dropped === 2);
ok("parseModelJson принимает голый массив", parseModelJson('[{"quote":"x"}]').length === 1);
ok("sanitizeFacts: «проверить», когда цитата совпала только без знаков", sanitizeFacts([{ kind: "places", title: "Тула", quote: "они переехали в Тулу в дом на улице Ленина", certainty: "ясно" }], TEXT).facts[0]?.certainty === "проверить");
const same = "dup-1";
await call({ requestId: same });
ok("повтор того же запроса не тратит лимит", (await call({ requestId: same })).status === 409);
mode = "fail";
const b2 = await left();
r = await call();
ok("сбой провайдера: 502, лимит возвращён", r.status === 502 && (await left()) === b2);
mode = "quota";
r = await call();
ok("квота Cloudflare кончилась: 429 и стоп", r.status === 429 && r.json.code === "provider_quota");
const n = calls;
ok("после остановки провайдер не вызывается", (await call()).status === 429 && calls === n);
// личный лимит
mode = "ok"; reply = JSON.stringify(good);
process.env.AI_LIMITS = JSON.stringify({ facts: { per: "month", user: 2, global: 100 } });
const B = makeToken({ order: "kr-2002", until: Date.now() + 86400000 });
const cb = () => run(ROUTES["ai-facts"], { token: B, deviceId: "d2", requestId: Math.random().toString(36), text: TEXT });
// провайдер остановлен выше до полуночи UTC: сбрасываем ключ через чужой аккаунт нельзя, поэтому проверяем лимит на пользователе до остановки
const { redis } = await import("./lib/redis.js");
await redis("DEL", "kr:ai:down:cloudflare-text");
await cb(); await cb();
r = await cb();
ok("личный лимит: третий вызов отклонён с датой обновления", r.status === 429 && r.json.code === "user_quota" && Boolean(r.json.resetAt));
ok("счётчик минут расшифровки не тронут", (await run(ROUTES["ai-status"], { token: B, deviceId: "d2" })).json.usage.audio_min.used === 0);
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
