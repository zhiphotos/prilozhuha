// Проверка подарка без банка: поддельный шлюз отвечает как RBS, Redis в памяти.
import http from "node:http";
const orders = new Map();
const gateway = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const p = new URLSearchParams(body);
    const method = req.url.split("/").pop();
    const send = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    if (method === "register.do") {
      const orderId = "22222222-aaaa-bbbb-cccc-" + String(orders.size + 1).padStart(12, "0");
      orders.set(orderId, { number: p.get("orderNumber"), amount: Number(p.get("amount")), params: JSON.parse(p.get("jsonParams")), bundle: JSON.parse(p.get("orderBundle")), status: 0 });
      return send({ orderId, formUrl: "https://pay.example/form/" + orderId });
    }
    if (method === "getOrderStatusExtended.do") {
      const o = orders.get(p.get("orderId"));
      if (!o) return send({ errorCode: "6" });
      return send({ orderStatus: o.status, amount: o.amount, orderNumber: o.number, merchantOrderParams: Object.entries(o.params).map(([name, value]) => ({ name, value })), authDateTime: Date.now() });
    }
    send({ errorCode: "5" });
  });
});
await new Promise((r) => gateway.listen(0, r));
process.env.ALFA_BASE_URL = `http://127.0.0.1:${gateway.address().port}`;
process.env.ALFA_API_USER = "test"; process.env.ALFA_API_PASSWORD = "test";
process.env.ACCESS_SECRET = "s".repeat(40); process.env.APP_ORIGINS = "https://app.example";

// Redis в памяти (MEMORY_STORE=1).
process.env.MEMORY_STORE = "1";
const redisMod = await import("./lib/redis.js");
const run = (handler, { method = "POST", url = "/", body, headers = {} } = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { resolve({ status: this.statusCode, headers: this.headers, text: t }); } };
  handler({ method, url, body, headers: { host: "api.example", origin: "https://app.example", ...headers } }, res);
});
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const checkout = (await import("./lib/routes/gift-checkout.js")).default;
const ret = (await import("./lib/routes/gift-return.js")).default;
const info = (await import("./lib/routes/gift-info.js")).default;
const open = (await import("./lib/routes/gift-open.js")).default;
const redeem = (await import("./lib/routes/redeem.js")).default;
const { reconcileGifts } = await import("./lib/gift.js");

const bad = await run(checkout, { body: { email: "x", app: "https://app.example/app/" } });
ok("плохая почта отклонена", bad.status === 400);
const evil = await run(checkout, { body: { email: "a@b.ru", app: "https://evil.example/" } });
ok("чужой адрес отклонён", evil.status === 400);
const c = await run(checkout, { body: { email: "Daria@Mail.ru", app: "https://app.example/app/", from: "Дима", to: "Мама", message: "С днём рождения!", card: "rose", legal: "x" } });
const orderId = JSON.parse(c.text).url.split("/").pop();
const o = orders.get(orderId);
ok("сумма и позиция «подарок» в чеке", o.amount === 202600 && o.bundle.cartItems.items[0].itemCode === "kniga-roda-gift" && o.params.product === "kniga-roda-gift");
const unpaid = await run(ret, { method: "GET", url: `/api/gift-return?gift=bad&to=${encodeURIComponent("https://app.example/app/")}` });
ok("неверный номер -> paid=0", unpaid.headers.location.includes("paid=0"));
// номер подарка из записи заказа
const giftId = [...(await redisMod.redis("HGETALL", "kr:giftpending"))].filter((x, i) => i % 2 === 1).map((x) => JSON.parse(x).id)[0];
const before = await run(info, { body: { id: giftId } });
ok("до оплаты открытку не показываем", JSON.parse(before.text).status === "unpaid");
const early = await run(open, { body: { id: giftId } });
ok("до оплаты открыть подарок нельзя", early.status === 402);
o.status = 2;
const back = await run(ret, { method: "GET", url: `/api/gift-return?gift=${giftId}&to=${encodeURIComponent("https://app.example/app/")}` });
ok("после оплаты даритель попадает на экран ссылки", back.headers.location === `https://app.example/app/#/gift-made/${giftId}`);
const shown = JSON.parse((await run(info, { body: { id: giftId } })).text);
ok("открытка без почты и кода", shown.status === "paid" && shown.to === "Мама" && shown.from === "Дима" && shown.card === "rose" && !("giverEmail" in shown) && !("code" in shown));
const got = JSON.parse((await run(open, { body: { id: giftId, email: "mama@mail.ru" } })).text);
ok("получатель получил код", /^[A-Z0-9]{8}$/.test(got.code));
const again = JSON.parse((await run(open, { body: { id: giftId } })).text);
ok("повторное открытие даёт тот же код", again.code === got.code);
const red = await run(redeem, { body: { code: got.code, deviceId: "dev1" } });
ok("код работает как личный доступ", red.status === 200 && JSON.parse(red.text).token?.startsWith("kr1."));
const grant = JSON.parse(await redisMod.redis("HGET", "kr:grants", got.code));
ok("на грант записана почта получателя", grant.email === "mama@mail.ru");
const { accessOfMail } = await import("./lib/login-by-mail.js");
ok("вход по почте получателя работает", (await accessOfMail("mama@mail.ru"))?.kind === "grant");
ok("у дарителя доступа нет", (await accessOfMail("daria@mail.ru")) === null);
ok("сверка ничего лишнего не делает", (await reconcileGifts()) === 0);
const fresh = JSON.parse((await run(checkout, { body: { email: "z@mail.ru", app: "https://app.example/app/", to: "Анна" } })).text);
const o2 = orders.get(fresh.url.split("/").pop()); o2.status = 2;
ok("сверка находит оплату без возврата на сайт", (await reconcileGifts()) === 1);
// Срок открытия: через год после оплаты неоткрытый подарок сам не открывается.
const giftLib = await import("./lib/gift.js");
await giftLib.saveGift("OLDOLDOLDOLDOLDOLDOL", { id: "OLDOLDOLDOLDOLDOLDOL", status: "paid", paidAt: Date.now() - 400 * 86400000, card: { from: "", to: "", message: "", card: "ivory" }, app: "https://app.example/app/" });
const late = await run(open, { body: { id: "OLDOLDOLDOLDOLDOLDOL" } });
ok("через год неоткрытый подарок сам не открывается", late.status === 410);
// Письмо получателю: по расписанию, один раз.
const sent = [];
process.env.MAIL_FROM = "t@example.com"; process.env.RESEND_API_KEY = "k";
const mail = http.createServer((req, res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { sent.push(JSON.parse(b)); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ id: "1" })); }); });
await new Promise((r) => mail.listen(0, r));
process.env.RESEND_API_URL = `http://127.0.0.1:${mail.address().port}`;
const soon = JSON.parse((await run(checkout, { body: { email: "g@mail.ru", app: "https://app.example/app/", to: "Оля", from: "Лена", recipientEmail: "Olya@Mail.ru", deliverAt: Date.now() + 3600_000 } })).text);
orders.get(soon.url.split("/").pop()).status = 2;
await reconcileGifts();
ok("письмо дарителю ушло, получателю ещё нет (время не пришло)", sent.length === 1 && sent[0].to.join?.() !== "olya@mail.ru");
const { deliverDue } = await import("./lib/gift.js");
const key = (await redisMod.redis("HGETALL", "kr:giftdeliver"))[0];
await redisMod.redis("HSET", "kr:giftdeliver", key, String(Date.now() - 1000));
ok("в назначенное время письмо уходит получателю", (await deliverDue()) === 1 && JSON.stringify(sent[1]).includes("olya@mail.ru"));
ok("второй раз не отправляется", (await deliverDue()) === 0 && sent.length === 2);
mail.close(); gateway.close(); process.exit(process.exitCode ?? 0);
