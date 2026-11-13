// Письма и вход по почте без интернета: поддельный банк и поддельный почтовый сервис.
import http from "node:http";
const orders = new Map();
const sent = [];
const srv = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    if (req.url.startsWith("/mail")) { sent.push(JSON.parse(body).message); return send({ status: "success" }); }
    const p = new URLSearchParams(body);
    const method = req.url.split("/").pop();
    if (method === "register.do") {
      const orderId = "11111111-aaaa-bbbb-cccc-" + String(orders.size + 1).padStart(12, "0");
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
Object.assign(process.env, { ALFA_BASE_URL: `http://127.0.0.1:${port}/bank`, ALFA_API_USER: "t", ALFA_API_PASSWORD: "t", ACCESS_SECRET: "s".repeat(40), APP_ORIGINS: "https://app.example", MEMORY_STORE: "1", UNISENDER_API_KEY: "k", MAIL_FROM: "info@x.ru", MAIL_API_URL: `http://127.0.0.1:${port}/mail` });
const checkout = (await import("./lib/routes/checkout.js")).default;
const ret = (await import("./lib/routes/pay-return.js")).default;
const loginCode = (await import("./lib/routes/login-code.js")).default;
const loginVerify = (await import("./lib/routes/login-verify.js")).default;
const run = (handler, { method = "POST", url = "/", body, headers = {} } = {}) => new Promise((resolve) => {
  const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(t) { resolve({ status: this.statusCode, headers: this.headers, text: t }); } };
  handler({ method, url, body, headers: { host: "api.example", origin: "https://app.example", ...headers } }, res);
});
let bad = 0;
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) bad++; };

const c = await run(checkout, { body: { email: "Mama@Mail.ru", app: "https://app.example/kr/", legal: "x" } });
const orderId = JSON.parse(c.text).url.split("/").pop();
const before = await run(loginCode, { body: { email: "mama@mail.ru" } });
ok("до оплаты код не высылается", before.status === 404 && sent.length === 0);
orders.get(orderId).status = 2;
const back = await run(ret, { method: "GET", url: `/api/pay-return?orderId=${orderId}&to=${encodeURIComponent("https://app.example/kr/")}` });
ok("возврат с банка открывает доступ", back.status === 302 && back.headers.location.includes("kr-access="));
ok("после оплаты ушло одно письмо на почту покупателя", sent.length === 1 && sent[0].recipients[0].email === "mama@mail.ru");
ok("в письме кнопка, шаги и почта", sent[0].body.html.includes("Открыть Книгу рода") && sent[0].body.html.includes("mama@mail.ru") && sent[0].body.html.includes("Уже оплатили?"));
await run(ret, { method: "GET", url: `/api/pay-return?orderId=${orderId}&to=${encodeURIComponent("https://app.example/kr/")}` });
ok("повторный возврат второго письма не шлёт", sent.length === 1);

const bad1 = await run(loginCode, { body: { email: "x" } });
ok("плохая почта отклонена", bad1.status === 400);
const unknown = await run(loginCode, { body: { email: "nobody@mail.ru" } });
ok("чужая почта: понятный отказ", unknown.status === 404 && /не нашла/.test(unknown.text));
const ask = await run(loginCode, { body: { email: "Mama@Mail.ru" } });
ok("код выслан", ask.status === 200 && sent.length === 2 && /^\d{6}$/.test(sent[1].subject.match(/\d{6}/)?.[0] ?? ""));
const again = await run(loginCode, { body: { email: "mama@mail.ru" } });
ok("не чаще раза в минуту", again.status === 429 && sent.length === 2);
const code = sent[1].subject.match(/\d{6}/)[0];
const wrong = await run(loginVerify, { body: { email: "mama@mail.ru", code: code === "000000" ? "111111" : "000000", deviceId: "d1" } });
ok("неверный код отклонён", wrong.status === 403);
const good = await run(loginVerify, { body: { email: "mama@mail.ru", code, deviceId: "d1" } });
const got = JSON.parse(good.text);
ok("верный код выдаёт доступ", good.status === 200 && got.token?.startsWith("kr1.") && got.order.startsWith("kr-"));
const reuse = await run(loginVerify, { body: { email: "mama@mail.ru", code, deviceId: "d1" } });
ok("код одноразовый", reuse.status === 404);
// возврат денег закрывает вход
orders.get(orderId).status = 4;
await run(loginCode, { body: { email: "mama@mail.ru" } }); // минутная пауза: сбрасываем вручную
const { redis } = await import("./lib/redis.js");
await redis("DEL", "kr:codewait:mama@mail.ru");
await run(loginCode, { body: { email: "mama@mail.ru" } });
const c2 = sent[sent.length - 1].subject.match(/\d{6}/)?.[0];
const refunded = await run(loginVerify, { body: { email: "mama@mail.ru", code: c2, deviceId: "d1" } });
ok("после возврата денег вход закрыт", refunded.status === 403 && /возвращена/.test(refunded.text));
srv.close();
process.exit(bad ? 1 : 0);
