import { timingSafeEqual } from "node:crypto";
import { throttled } from "../throttle.js";
import { orderState } from "../alfa.js";
import { bodyOf, cors, json } from "../config.js";
import { DEVICE_ERROR, claimDevice } from "../devices.js";
import { redis, redisConfigured } from "../redis.js";
import { makeToken } from "../token.js";
import { accessOfMail } from "../login-by-mail.js";

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

// POST /api/login-verify { email, code, deviceId }  – проверить шесть цифр и выдать доступ на это устройство.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (await throttled(req, res, "loginverify", 60)) return;
  if (!redisConfigured()) return json(res, 503, { error: "Вход по почте пока не подключён." });
  const body = bodyOf(req);
  const mail = String(body.email ?? "").trim().toLowerCase().slice(0, 120);
  const code = String(body.code ?? "").replace(/\D/g, "").slice(0, 6);
  if (!mail || code.length !== 6) return json(res, 400, { error: "Впишите шесть цифр из письма." });
  try {
    const raw = await redis("GET", `kr:code:${mail}`);
    if (!raw) return json(res, 404, { error: "Код устарел или не запрошен. Нажмите «Прислать код» ещё раз." });
    const record = JSON.parse(raw);
    if (record.tries >= 5) {
      await redis("DEL", `kr:code:${mail}`);
      return json(res, 429, { error: "Слишком много ошибок. Запросите новый код." });
    }
    if (!same(String(record.code), code)) {
      await redis("SET", `kr:code:${mail}`, JSON.stringify({ ...record, tries: record.tries + 1 }), "EX", 900);
      return json(res, 403, { error: "Код не подошёл. Проверьте цифры в письме." });
    }
    const access = await accessOfMail(mail);
    if (!access || access.until < Date.now()) return json(res, 404, { error: "Срок доступа закончился." });
    // Оплату в банке сверяем ещё раз: после возврата денег доступ закрывается.
    if (access.kind === "paid") {
      const state = await orderState({ orderNumber: access.order });
      if (!state.ok) return json(res, 403, { error: "Эта оплата уже возвращена." });
    }
    if (!(await claimDevice(access.order, body.deviceId))) return json(res, 403, { error: DEVICE_ERROR });
    await redis("DEL", `kr:code:${mail}`);
    return json(res, 200, { token: makeToken({ order: access.order, until: access.until }), until: access.until, order: access.order });
  } catch (error) {
    console.error("[login-verify]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Не получилось проверить код. Попробуйте позже." });
  }
}
