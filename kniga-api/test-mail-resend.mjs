// Проверка отправки через Resend: запрос уходит с ключом, отправителем и получателем; ошибка сервиса даёт исключение.
import http from "node:http";
let got = null, status = 200;
const srv = http.createServer((req, res) => {
  let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got = { auth: req.headers.authorization, body: JSON.parse(b) }; res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(status === 200 ? { id: "x" } : { message: "domain not verified" })); });
}).listen(0, "127.0.0.1", async () => {
  const port = srv.address().port;
  Object.assign(process.env, { RESEND_API_KEY: "re_test", RESEND_API_URL: `http://127.0.0.1:${port}/emails`, MAIL_FROM: "hello@x.ru" });
  const { sendMail, mailConfigured } = await import("./lib/mail.js");
  const t = (n, ok) => { console.log((ok ? "ok" : "FAIL") + " " + n); if (!ok) process.exitCode = 1; };
  t("настроено по ключу Resend", mailConfigured());
  await sendMail({ to: "a@b.ru", subject: "s", html: "<b>h</b>", text: "t" });
  t("ключ в заголовке", got.auth === "Bearer re_test");
  t("отправитель с именем", got.body.from === "Книга рода <hello@x.ru>");
  t("получатель", got.body.to[0] === "a@b.ru");
  status = 403;
  let err = ""; try { await sendMail({ to: "a@b.ru", subject: "s", html: "h", text: "t" }); } catch (e) { err = e.message; }
  t("ошибка сервиса даёт исключение", err.includes("403") && err.includes("not verified"));
  srv.close();
});
