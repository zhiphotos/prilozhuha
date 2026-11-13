import { randomInt } from "node:crypto";
import { throttled } from "../throttle.js";
import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { mailConfigured, sendMail } from "../mail.js";
import { codeMail } from "../mail-templates.js";
import { accessOfMail } from "../login-by-mail.js";

// POST /api/login-code { email }  – прислать на почту шесть цифр для входа (если на этой почте есть оплата).
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (await throttled(req, res, "logincode", 30)) return;
  if (!redisConfigured() || !mailConfigured()) return json(res, 503, { error: "Вход по почте пока не подключён." });
  const mail = String(bodyOf(req).email ?? "").trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return json(res, 400, { error: "Проверьте почту: нужен адрес вида name@mail.ru." });
  try {
    const access = await accessOfMail(mail);
    if (!access) return json(res, 404, { error: "На этой почте я не нашла оплаты. Впишите ту почту, которую вводили при оплате." });
    // Не чаще одного письма в минуту на одну почту.
    if ((await redis("SET", `kr:codewait:${mail}`, "1", "EX", 60, "NX")) !== "OK") return json(res, 429, { error: "Код уже отправлен. Подождите минуту, загляните в «Спам» и нажмите ещё раз, если письма нет." });
    const code = String(randomInt(100000, 1000000));
    await redis("SET", `kr:code:${mail}`, JSON.stringify({ code, tries: 0 }), "EX", 900);
    await sendMail({ to: mail, ...codeMail({ code }) });
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("[login-code]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Не получилось отправить письмо. Попробуйте через минуту." });
  }
}
