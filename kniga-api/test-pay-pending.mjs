// Оплата без возврата на сайт: сверка с банком находит оплаченные заказы и шлёт письмо. `node test-pay-pending.mjs`
import http from "node:http";
const orders = new Map();
const sent = [];
let mailFails = false;
const srv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (o, code = 200) => { res.statusCode = code; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    if (req.url.startsWith("/mail")) { if (mailFails) return send({ status: "error", message: "down" }, 503); sent.push(JSON.parse(body).message); return send({ status: "success" }); }
    const p = new URLSearchParams(body);
    const method = req.url.split("/").pop();
    if (method === "register.do") {
      const orderId = "22222222-aaaa-bbbb-cccc-" + String(orders.size + 1).padStart(12, "0");
      orders.set(orderId, { number: p.get("orderNumber"), amount: Number(p.get("amount")), params: JSON.parse(p.get("jsonParams")), status: 0 });
      return send({ orderId, formUrl: "https://pay.example/form/" + orderId });
    }
    if (method === "getOrderStatusExtended.do") {
      const o = p.get("orderId") ? orders.get(p.get("orderId")) : [...orders.values()].find((x) => x.number === p.get("orderNumber"));
      if (!o) return send({ errorCode: "6" });
      return send({ orderStatus: o.status, amount: o.amount, orderNumber: o.number, merchantOrderParams: Object.entries(o.params).map(([name, value]) => ({ name, value })), authDateTime: Date.now() });
    }
    send({ errorCode: "5" });
  });
});
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
Object.assign(process.env, { MEMORY_STORE: "1", ALFA_BASE_URL: `http://127.0.0.1:${port}/bank`, ALFA_API_USER: "t", ALFA_API_PASSWORD: "t", ACCESS_SECRET: "s".repeat(40), APP_ORIGINS: "https://app.example", UNISENDER_API_KEY: "k", MAIL_FROM: "info@x.ru", MAIL_API_URL: `http://127.0.0.1:${port}/mail` });
delete process.env.RESEND_API_KEY;
const { createCheckout } = await import("./lib/alfa.js");
const { rememberPending, reconcilePending } = await import("./lib/pay-pending.js");
const { redis } = await import("./lib/redis.js");
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const order = async (email) => {
  const c = await createCheckout({ email, ads: false, legal: "1", returnUrl: "https://x/r", failUrl: "https://x/f" });
  await rememberPending({ orderId: c.orderId, orderNumber: c.orderNumber, email });
  return c;
};

const a = await order("anna@x.ru");
ok("не оплачено: ничего не записано", (await reconcilePending()) === 0 && !(await redis("HGET", "kr:paid", "anna@x.ru")));
orders.get(a.orderId).status = 2;
ok("оплачено без возврата на сайт: оплата записана", (await reconcilePending()) === 1 && Boolean(await redis("HGET", "kr:paid", "anna@x.ru")));
ok("письмо отправлено один раз", sent.length === 1);
ok("заказ убран из очереди", (await redis("HLEN", "kr:pending")) === 0);
ok("повторный проход не шлёт второе письмо", (await reconcilePending()) === 0 && sent.length === 1);

const b = await order("boris@x.ru");
orders.get(b.orderId).status = 2;
mailFails = true;
ok("письмо не ушло: оплата записана, заказ остаётся в очереди", (await reconcilePending()) === 0 && Boolean(await redis("HGET", "kr:paid", "boris@x.ru")) && (await redis("HLEN", "kr:pending")) === 1);
mailFails = false;
ok("почта ожила: письмо уходит и очередь пустеет", (await reconcilePending()) === 1 && sent.length === 2 && (await redis("HLEN", "kr:pending")) === 0);

const c = await order("clara@x.ru");
orders.get(c.orderId).status = 4;
await reconcilePending();
ok("возврат денег: заказ забыт, доступа нет", (await redis("HLEN", "kr:pending")) === 0 && !(await redis("HGET", "kr:paid", "clara@x.ru")));
srv.close();
