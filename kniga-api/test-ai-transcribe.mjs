// Проверка расшифровки на памяти и поддельном Cloudflare: `node test-ai-transcribe.mjs`
process.env.MEMORY_STORE = "1"; process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const run = (handler, body) => new Promise((resolve) => {
  const res = { statusCode: 200, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method: "POST", body, headers: { origin: "https://app.example" }, socket: {} }, res);
});
const { ROUTES } = await import("./lib/routes/index.js");
const { makeToken } = await import("./lib/token.js");
const A = makeToken({ order: "kr-1001", until: Date.now() + 86400000 });
let calls = 0, mode = "ok", lastBody = null;
globalThis.fetch = async (url, init) => {
  calls += 1; lastBody = JSON.parse(init.body);
  if (mode === "quota") return { status: 429, ok: false, json: async () => ({ success: false, errors: [{ code: 4006 }] }) };
  if (mode === "fail") return { status: 500, ok: false, json: async () => ({}) };
  return { status: 200, ok: true, json: async () => ({ success: true, result: { text: "Мы жили в деревне.", segments: [{ start: 0, end: 3.2, text: " Мы жили в деревне." }] } }) };
};
const chunk = (extra = {}) => run(ROUTES["ai-transcribe"], { token: A, deviceId: "d1", requestId: Math.random().toString(36), audio: "UklGRg==", seconds: 60, ...extra });

ok("без токена 401", (await run(ROUTES["ai-transcribe"], { audio: "x", seconds: 5 })).status === 401);
let r = await chunk();
ok("по умолчанию выключено, Cloudflare не вызван", r.status === 503 && r.json.code === "disabled" && calls === 0);
process.env.AI_ENABLED = "1";
r = await chunk();
ok("без ключей: не подключено", r.status === 503 && r.json.code === "not_configured" && calls === 0);
process.env.CF_ACCOUNT_ID = "acc"; process.env.CF_API_TOKEN = "tok";
ok("слишком длинный кусок отклонён", (await chunk({ seconds: 120 })).status === 400);
ok("пустой звук отклонён", (await chunk({ audio: "" })).status === 400);
r = await chunk();
ok("успех: текст, отметки времени, остаток минут", r.status === 200 && r.json.text.startsWith("Мы жили") && r.json.segments[0].end === 3.2 && r.json.left === 299);
ok("в Cloudflare ушли язык, VAD и защита от зацикливания", lastBody.language === "ru" && lastBody.vad_filter === true && lastBody.condition_on_previous_text === false);
const same = "dup-1";
await chunk({ requestId: same });
ok("повтор того же куска не тратит минуты", (await chunk({ requestId: same })).status === 409);
mode = "fail";
const before = (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.audio_min.left;
r = await chunk();
const after = (await run(ROUTES["ai-status"], { token: A, deviceId: "d1" })).json.usage.audio_min.left;
ok("сбой провайдера: 502 и минуты возвращены", r.status === 502 && after === before);
mode = "quota";
r = await chunk();
ok("квота Cloudflare кончилась: 429 и стоп без повторов", r.status === 429 && r.json.code === "provider_quota");
const n = calls;
r = await chunk();
ok("после остановки провайдер больше не вызывается", r.status === 429 && calls === n);
