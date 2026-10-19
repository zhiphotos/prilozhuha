// Проверка напоминаний и семейной комнаты на памяти вместо базы: `node test-family.mjs`
process.env.MEMORY_STORE = "1"; process.env.PUSH_DRY_RUN = "1";
process.env.VAPID_PUBLIC_KEY = "pub"; process.env.VAPID_PRIVATE_KEY = "priv";
process.env.CRON_SECRET = "c".repeat(20); process.env.APP_ORIGINS = "https://app.example"; process.env.ACCESS_SECRET = "s".repeat(40);
const load = async (n) => (await import(`./api/${n}.js`)).default;
const run = (handler, { method = "POST", url = "/", body, headers = {} } = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { resolve({ status: this.statusCode, json: t ? JSON.parse(t) : null }); } };
  handler({ method, url, body, headers: { host: "api.example", origin: "https://app.example", ...headers }, socket: { remoteAddress: "1.2.3.4" } }, res);
});
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };

// ——— напоминания
const sub = await load("push-subscribe"), tick = await load("push-tick"), ping = await load("push-ping"), unsub = await load("push-unsubscribe"), cfg = await load("push-config");
ok("push-config включён", (await run(cfg, { method: "GET" })).json.enabled === true);
const now = new Date(); const offsetMin = 180; const local = new Date(now.getTime() + offsetMin * 60000);
const subscription = { endpoint: "https://push.example/abc", keys: { p256dh: "k1", auth: "k2" } };
const mk = (extra = {}) => ({ subscription, hour: local.getUTCHours(), offsetMin, days: [0, 1, 2, 3, 4, 5, 6], app: "https://app.example/kr/#x", stats: { people: 0, pages: 1 }, ...extra });
ok("подписка принята", (await run(sub, { body: mk() })).json.ok === true);
ok("чужой адрес приложения отклонён", (await run(sub, { body: mk({ app: "https://evil.example/" }) })).status === 400);
ok("кривая подписка отклонена", (await run(sub, { body: mk({ subscription: { endpoint: "http://x" } }) })).status === 400);
ok("без ключа планировщика нельзя", (await run(tick, { method: "GET", url: "/api/push-tick?key=bad" })).status === 401);
// человек только что подписался и открыл приложение: сегодня напоминание не нужно
let t = await run(tick, { method: "GET", url: `/api/push-tick?key=${process.env.CRON_SECRET}` });
ok("в день открытия молчим", t.json.sent === 0);
// «вчера» открывал
const { redis } = await import("./lib/redis.js"); const { subId } = await import("./lib/push.js");
const id = subId(subscription.endpoint); const rec = JSON.parse(await redis("HGET", "kr:push", id)); rec.lastSeen = Date.now() - 2 * 86400000; rec.hour = local.getUTCHours(); /* час «сейчас» мог оказаться ночным: подписка ограничивает 6–23 */ await redis("HSET", "kr:push", id, JSON.stringify(rec));
t = await run(tick, { method: "GET", url: `/api/push-tick?key=${process.env.CRON_SECRET}` });
ok("через два дня напоминание уходит", t.json.sent === 1 && t.json.sample[0].length > 3);
t = await run(tick, { method: "GET", url: `/api/push-tick?key=${process.env.CRON_SECRET}` });
ok("второе за день не уходит", t.json.sent === 0);
ok("ping обновляет заход", (await run(ping, { body: { endpoint: subscription.endpoint, stats: { people: 3, pages: 5, lessonsDone: 1, paid: true } } })).json.ok === true);
ok("отписка стирает данные", (await run(unsub, { body: { endpoint: subscription.endpoint } })).json.ok === true && (await redis("HGET", "kr:push", id)) === null);
const { pickMessage } = await import("./lib/push-messages.js");
const base = Date.now();
ok("давно не заходил: мягкое возвращение раз в неделю", pickMessage({ lastSeen: base - 9 * 86400000, lastSent: base - 8 * 86400000, seq: 0, stats: {} }, base)?.title && pickMessage({ lastSeen: base - 9 * 86400000, lastSent: base - 2 * 86400000, seq: 0, stats: {} }, base) === null);
ok("после двух месяцев тишина", pickMessage({ lastSeen: base - 70 * 86400000, seq: 0, stats: {} }, base) === null);
ok("платному напоминают про урок", pickMessage({ lastSeen: base - 86400000, seq: 0, stats: { paid: true, lessonsDone: 2, people: 2 } }, base).title.startsWith("Урок 3"));

// ——— семейная комната
const create = await load("room-create"), info = await load("room-info"), submit = await load("room-submit"), inbox = await load("room-inbox"), ack = await load("room-ack");
const c = await run(create, { body: { name: "Семья Жижиных" } });
const { room, ownerKey, inviteKey } = c.json;
ok("комната создана", c.status === 200 && room?.length === 12 && ownerKey && inviteKey);
ok("приглашение показывает имя", (await run(info, { body: { room, invite: inviteKey } })).json.name === "Семья Жижиных");
ok("чужая ссылка не открывается", (await run(info, { body: { room, invite: "nope" } })).status === 404);
const tiny = "data:image/jpeg;base64," + "A".repeat(200);
const s1 = await run(submit, { body: { room, invite: inviteKey, from: { name: "Тётя Нина", relation: "тётя" }, kind: "story", title: "Дом на Еловой", text: "Дом стоял на краю деревни." } });
const s2 = await run(submit, { body: { room, invite: inviteKey, from: { name: "Дядя Миша" }, kind: "photo", text: "Мы на рыбалке, 1985", photo: tiny } });
ok("воспоминание и фото приняты", s1.json.ok && s2.json.ok);
ok("пустое не принимается", (await run(submit, { body: { room, invite: inviteKey, from: { name: "x" }, text: "" } })).status === 400);
ok("огромное фото отклонено", (await run(submit, { body: { room, invite: inviteKey, from: { name: "x" }, text: "t", photo: "data:image/jpeg;base64," + "A".repeat(700000) } })).status === 400);
ok("чужой не читает входящие", (await run(inbox, { body: { room, ownerKey: "bad" } })).status === 404);
const box = await run(inbox, { body: { room, ownerKey } });
ok("владелец видит входящие по порядку", box.json.items.length === 2 && box.json.items[0].from.name === "Тётя Нина" && box.json.items[1].photo === tiny);
await run(ack, { body: { room, ownerKey, ids: [box.json.items[0].id] } });
ok("принятое убрано", (await run(inbox, { body: { room, ownerKey } })).json.items.length === 1);
const rot = await run(ack, { body: { room, ownerKey, rotate: true } });
ok("после смены ссылки старая не работает", (await run(info, { body: { room, invite: inviteKey } })).status === 404 && (await run(info, { body: { room, invite: rot.json.inviteKey } })).json.ok === true);
process.env.REQUIRE_PAID = "1";
ok("платный режим без токена: отказ", (await run(create, { body: { name: "x" } })).status === 402);
const { makeToken } = await import("./lib/token.js");
ok("платный режим с токеном: можно", (await run(create, { body: { name: "x", token: makeToken({ order: "kr-a-12345678", until: Date.now() + 1e6 }) } })).status === 200);
