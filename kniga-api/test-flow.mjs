// Проверка всей цепочки оплаты без банка: поддельный шлюз отвечает как RBS.
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
      const orderId = "11111111-aaaa-bbbb-cccc-" + String(orders.size + 1).padStart(12, "0");
      orders.set(orderId, { number: p.get("orderNumber"), amount: Number(p.get("amount")), params: JSON.parse(p.get("jsonParams")), bundle: JSON.parse(p.get("orderBundle")), status: 0 });
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
await new Promise((r) => gateway.listen(0, r));
process.env.ALFA_BASE_URL = `http://127.0.0.1:${gateway.address().port}`;
process.env.ALFA_API_USER = "test"; process.env.ALFA_API_PASSWORD = "test";
process.env.ACCESS_SECRET = "s".repeat(40); process.env.APP_ORIGINS = "https://app.example";
const checkout = (await import("./lib/routes/checkout.js")).default;
const ret = (await import("./lib/routes/pay-return.js")).default;
const claim = (await import("./lib/routes/claim.js")).default;
const verify = (await import("./lib/routes/verify.js")).default;
const run = (handler, { method = "POST", url = "/", body, headers = {} } = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { resolve({ status: this.statusCode, headers: this.headers, text: t }); } };
  handler({ method, url, body, headers: { host: "api.example", origin: "https://app.example", ...headers } }, res);
});
const ok = (name, cond) => console.log(cond ? "ok  " : "FAIL", name);
const c = await run(checkout, { body: { email: "Mama@Mail.ru", app: "https://app.example/kr/", ads: true, legal: "2026-10-20" } });
const { url } = JSON.parse(c.text); const orderId = url.split("/").pop();
ok("checkout вернул адрес банка", c.status === 200 && url.includes("pay.example"));
const o = orders.get(orderId);
ok("сумма 2026 руб в копейках", o.amount === 202600);
ok("в чеке почта и позиция-услуга", o.bundle.customerDetails.email === "mama@mail.ru" && o.bundle.cartItems.items[0].itemAmount === 202600);
ok("согласия записаны", o.params.consentPd === true && o.params.consentAds === true && o.params.legal === "2026-10-20");
const bad = await run(checkout, { body: { email: "x", app: "https://app.example/" } });
ok("плохая почта отклонена", bad.status === 400);
const evil = await run(checkout, { body: { email: "a@b.ru", app: "https://evil.example/" } });
ok("чужой адрес приложения отклонён", evil.status === 400);
const unpaid = await run(ret, { method: "GET", url: `/api/pay-return?orderId=${orderId}&to=${encodeURIComponent("https://app.example/kr/")}` });
ok("неоплаченный заказ -> paid=0", unpaid.headers.location.includes("paid=0") && !unpaid.headers.location.includes("kr-access"));
o.status = 2;
const paid = await run(ret, { method: "GET", url: `/api/pay-return?orderId=${orderId}&to=${encodeURIComponent("https://app.example/kr/")}` });
const loc = new URL(paid.headers.location);
const token = new URLSearchParams(loc.hash.slice(1)).get("kr-access");
ok("оплаченный -> paid=1 и токен", loc.search === "?paid=1" && token?.startsWith("kr1."));
const v = await run(verify, { body: { token } });
ok("токен действует", JSON.parse(v.text).valid === true);
const forged = await run(verify, { body: { token: token.slice(0, -3) + "AAA" } });
ok("подделанный токен не проходит", JSON.parse(forged.text).valid === false);
const cl = await run(claim, { body: { order: o.number, email: "mama@mail.ru" } });
ok("доступ по номеру заказа и почте", cl.status === 200 && JSON.parse(cl.text).token.startsWith("kr1."));
const wrong = await run(claim, { body: { order: o.number, email: "other@mail.ru" } });
ok("чужая почта не открывает", wrong.status === 404);
o.status = 4;
const refunded = await run(verify, { body: { token } });
ok("после возврата доступ закрывается", JSON.parse(refunded.text).valid === false);
gateway.close();
