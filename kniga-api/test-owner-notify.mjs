// Уведомления владельцу об оплате и первом входе на памяти и поддельном почтовом сервисе: `node test-owner-notify.mjs`
process.env.MEMORY_STORE = "1"; process.env.MAIL_FROM = "hello@kniga.example"; process.env.RESEND_API_KEY = "r"; process.env.OWNER_NOTIFY_EMAIL = "owner@example.com";
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const mails = [];
globalThis.fetch = async (url, init) => { const b = JSON.parse(init.body); mails.push({ to: b.to[0], subject: b.subject, text: b.text }); return { ok: true, status: 200, json: async () => ({}) }; };
const { redis } = await import("./lib/redis.js");
const { recordPaid } = await import("./lib/paid.js");
const { claimDevice } = await import("./lib/devices.js");
const { takeNotices } = await import("./lib/outbox.js");
const tick = () => new Promise((r) => setTimeout(r, 30));

await recordPaid({ email: "anna.petrova@mail.ru", orderNumber: "kr-777", until: Date.now() + 86400000 * 365, paidAt: Date.now() });
await tick();
const pay = mails.find((m) => /Новая оплата/.test(m.subject));
ok("письмо об оплате ушло владельцу", pay && pay.to === "owner@example.com");
ok("почта покупателя в письме скрыта", pay && /an\*\*\*@mail\.ru/.test(pay.text) && !/anna\.petrova/.test(pay.text));
await recordPaid({ email: "anna.petrova@mail.ru", orderNumber: "kr-777", until: Date.now(), paidAt: Date.now() });
await tick();
ok("повторная запись той же оплаты не шлёт второе уведомление", mails.filter((m) => /Новая оплата/.test(m.subject)).length === 1);

ok("первое устройство занято", await claimDevice("kr-777", "dev-1"));
await tick();
ok("письмо о первом входе по оплате", mails.some((m) => /Новый человек зашёл/.test(m.subject) && /kr-777/.test(m.text)));
await claimDevice("kr-777", "dev-2");
await tick();
ok("второе устройство того же человека не считается новым входом", mails.filter((m) => /Новый человек/.test(m.subject)).length === 1);

await redis("HSET", "kr:grants", "ABC123", JSON.stringify({ email: "lena@gmail.com", at: Date.now(), note: "переезд с GetCourse" }));
await claimDevice("grant-ABC123", "dev-9");
await tick();
ok("первый вход по коду с пометкой и скрытой почтой", mails.some((m) => /по коду/.test(m.text) && /GetCourse/.test(m.text) && /le\*\*\*@gmail\.com/.test(m.text)));

ok("копия уведомлений лежит в очереди бота", (await takeNotices()).length >= 3);

process.env.OWNER_NOTIFY_EMAIL = "";
const before = mails.length;
await recordPaid({ email: "x@y.ru", orderNumber: "kr-888", until: Date.now() + 1000, paidAt: Date.now() });
await tick();
ok("без OWNER_NOTIFY_EMAIL письмо владельцу не шлётся и оплата не ломается", mails.length === before + 1 && mails[mails.length - 1].to === "x@y.ru");
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
