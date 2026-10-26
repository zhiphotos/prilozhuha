import { redis, redisConfigured } from "./redis.js";

/** Один оплаченный доступ работает не больше чем на 3 устройствах (решение Дарины 2026-10-26: лимит 3 и синхронизация). Бесконечность отключает лимит. */
export const DEVICE_LIMIT = 3;
const IDLE_DAYS = 30; // устройство, которым не пользовались месяц, освобождает место само

const key = (identity) => `kr:dev:${identity}`;

/** Занять место для устройства. false: уже заняты все места другими устройствами. Без идентификатора устройства (старое приложение) пропускаем. */
export async function claimDevice(identity, deviceId) {
  if (!deviceId || !redisConfigured() || DEVICE_LIMIT === Infinity) return true;
  const id = String(deviceId).slice(0, 64);
  const now = Date.now();
  const all = (await redis("HGETALL", key(identity))) ?? [];
  const known = {};
  for (let i = 0; i < all.length; i += 2) known[all[i]] = Number(all[i + 1]);
  for (const [dev, seen] of Object.entries(known)) {
    if (now - seen > IDLE_DAYS * 86400000) {
      await redis("HDEL", key(identity), dev);
      delete known[dev];
    }
  }
  if (!(id in known) && Object.keys(known).length >= DEVICE_LIMIT) return false;
  await redis("HSET", key(identity), id, String(now));
  return true;
}

export const resetDevices = (identity) => redis("DEL", key(identity));
export const DEVICE_ERROR = "Этот доступ уже открыт на трёх устройствах. Напишите Дарине, она освободит место.";
