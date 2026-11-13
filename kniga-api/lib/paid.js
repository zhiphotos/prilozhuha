import { redis } from "./redis.js";
import { mailConfigured, sendMail } from "./mail.js";
import { paidMail } from "./mail-templates.js";

/** Запоминаем оплату по почте (вход «по почте и коду») и один раз отправляем письмо «Доступ открыт». Сбой письма оплату не ломает. */
export async function recordPaid({ email, orderNumber, until, paidAt }) {
  if (!email || !orderNumber) return;
  try {
    await redis("HSET", "kr:paid", email, JSON.stringify({ order: orderNumber, until, paidAt }));
    if (!mailConfigured()) return;
    const first = await redis("SET", `kr:mailed:${orderNumber}`, "1", "NX");
    if (first !== "OK") return;
    try {
      await sendMail({ to: email, ...paidMail({ email, order: orderNumber }) });
    } catch (error) {
      await redis("DEL", `kr:mailed:${orderNumber}`); // письмо не ушло: следующий заход попробует снова
      throw error;
    }
  } catch (error) {
    console.error("[paid-mail]", error instanceof Error ? error.message : error);
  }
}
