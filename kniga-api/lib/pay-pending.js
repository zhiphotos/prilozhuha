// Оплата не должна зависеть от того, вернулся ли человек на сайт со страницы банка (закрыл вкладку, платил через приложение банка).
// При создании заказа запоминаем его, а сервер раз в минуту спрашивает банк: оплачен ли. Оплачен: записываем оплату и шлём письмо.
import { accessUntil, orderState } from "./alfa.js";
import { redis, redisConfigured } from "./redis.js";
import { recordPaid } from "./paid.js";

const KEY = "kr:pending";
const GIVE_UP_MS = 3 * 86400000; // не оплатили за три дня: забываем заказ
const FAST_MS = 30 * 60000; // первые полчаса проверяем каждую минуту
const SLOW_MS = 10 * 60000; // дальше раз в десять минут, чтобы не дёргать банк из-за брошенных заказов

export async function rememberPending({ orderId, orderNumber, email }) {
  if (!redisConfigured() || !orderId) return;
  await redis("HSET", KEY, orderId, JSON.stringify({ orderNumber, email, at: Date.now(), last: 0 }));
}

export async function forgetPending(orderId) {
  if (!redisConfigured() || !orderId) return;
  await redis("HDEL", KEY, orderId).catch(() => undefined);
}

let running = false;

/** Один проход. Возвращает, сколько оплат записано. */
export async function reconcilePending() {
  if (running || !redisConfigured()) return 0;
  running = true;
  let recorded = 0;
  try {
    const flat = (await redis("HGETALL", KEY)) ?? [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const orderId = flat[i];
      const rec = JSON.parse(flat[i + 1]);
      const age = Date.now() - Number(rec.at || 0);
      if (age > GIVE_UP_MS) {
        await redis("HDEL", KEY, orderId);
        continue;
      }
      if (age > FAST_MS && Date.now() - Number(rec.last || 0) < SLOW_MS) continue;
      try {
        const state = await orderState({ orderId });
        await redis("HSET", KEY, orderId, JSON.stringify({ ...rec, last: Date.now() }));
        if (state.refunded) {
          await redis("HDEL", KEY, orderId);
        } else if (state.ok && state.orderNumber) {
          await recordPaid({ email: state.email || rec.email, orderNumber: state.orderNumber, until: accessUntil(state.paidAt), paidAt: state.paidAt });
          // Письмо не ушло: заказ остаётся в очереди, следующий проход отправит снова.
          if (await redis("EXISTS", `kr:mailed:${state.orderNumber}`)) {
            await redis("HDEL", KEY, orderId);
            recorded += 1;
          }
        }
      } catch (error) {
        console.error("[pay-reconcile]", orderId, error instanceof Error ? error.message : error);
      }
    }
  } finally {
    running = false;
  }
  return recorded;
}
