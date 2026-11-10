// Проверка бота «Дед Привратник» и вебхука Tribute на памяти: `node test-tribute-bot.mjs`
process.env.MEMORY_STORE = "1"; process.env.TRIBUTE_API_KEY = "k".repeat(24); process.env.TG_WEBHOOK_SECRET = "s".repeat(24);
process.env.TRIBUTE_LINK = "https://web.tribute.tg/p/1"; process.env.APP_ORIGINS = "https://app.example";
import { createHmac } from "node:crypto";
const load = async (n) => (await import(`./lib/routes/${n}.js`)).default;
const run = (handler, { body, headers = {}, raw } = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method: "POST", url: "/", body, rawBody: raw, headers: { host: "api.example", origin: "https://app.example", ...headers }, socket: { remoteAddress: "1.2.3.4" } }, res);
});
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const hook = await load("tribute-hook");
const { reply } = await import("./lib/routes/tg-bot.js");
const { redis } = await import("./lib/redis.js");
const sign = (raw) => createHmac("sha256", process.env.TRIBUTE_API_KEY).update(raw).digest("hex");
const evt = (name, payload) => { const body = { name, created_at: "2026-11-10T10:00:00Z", payload }; const raw = JSON.stringify(body); return { body, raw, headers: { "trbt-signature": sign(raw) } }; };

ok("чужая подпись отклонена", (await run(hook, { ...evt("new_digital_product", { telegram_user_id: 1 }), headers: { "trbt-signature": "x".repeat(64) } })).status === 401);
const me = { id: 777, username: "nina", first_name: "Нина" };
ok("до оплаты бот ключ не даёт", /не вижу/i.test(await reply(me, "/start")) && /не вижу/i.test(await reply(me, "nina@mail.ru")));
ok("оплата принята", (await run(hook, evt("new_digital_product", { product_id: 5, amount: 2026, currency: "rub", telegram_user_id: 777, telegram_username: "nina", purchase_id: 91 }))).json.status === "ok");
ok("после оплаты бот просит почту", /почту/i.test(await reply(me, "/start")));
ok("кривая почта не принимается", /не разберу/i.test(await reply(me, "привет")));
const given = await reply(me, "Моя почта Nina@Mail.ru спасибо");
const code = given.match(/ключ: ([A-Z2-9]{8})/)?.[1];
ok("ключ выдан на почту", Boolean(code));
const grant = JSON.parse(await redis("HGET", "kr:grants", code));
ok("ключ записан как у ручной выдачи, почта в нижнем регистре, срок 10 лет", grant.email === "nina@mail.ru" && grant.days === 3650);
ok("повторно тот же ключ", (await reply(me, "/start")).includes(code) && (await reply(me, "ещё раз nina@mail.ru")).includes(code));
ok("повтор вебхука ничего не ломает", (await run(hook, evt("new_digital_product", { product_id: 5, telegram_user_id: 777, purchase_id: 91 }))).status === 200 && (await reply(me, "/start")).includes(code));
ok("возврат отзывает ключ", (await run(hook, evt("digital_product_refunded", { purchase_id: 91, telegram_user_id: 777 }))).status === 200 && (await redis("HGET", "kr:grants", code)) === null);
ok("после возврата бот не даёт", /не вижу/i.test(await reply(me, "/start")));
const bot = await load("tg-bot");
ok("бот без секрета отклонён", (await run(bot, { body: { message: {} }, headers: { "x-telegram-bot-api-secret-token": "bad" } })).status === 401);
ok("бот с секретом отвечает 200", (await run(bot, { body: {}, headers: { "x-telegram-bot-api-secret-token": process.env.TG_WEBHOOK_SECRET } })).status === 200);
process.exit(process.exitCode ?? 0);
