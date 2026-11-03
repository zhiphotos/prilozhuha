import { createHash } from "node:crypto";
import { bodyOf, cors, json } from "../config.js";
import { DEVICE_ERROR, claimDevice } from "../devices.js";
import { redis, redisConfigured } from "../redis.js";
import { readToken } from "../token.js";

/** Стабильный анонимный идентификатор владельца книги. Берётся только из проверенной подписи токена (поле order),
 * никогда из данных, которые прислал браузер. Хеш, чтобы в ключах Redis не лежали номера заказов и коды. */
export const ownerOf = (order) => createHash("sha256").update(`kr-ai:${order}`).digest("hex").slice(0, 24);

/** Проверка доступа для ИИ-маршрутов. Возвращает { body, owner } или null (ответ уже отправлен). */
export async function requireAccess(req, res) {
  if (cors(req, res)) return null;
  if (req.method !== "POST") return void json(res, 405, { error: "method" }) ?? null;
  if (!redisConfigured()) return void json(res, 503, { error: "Хранилище не подключено." }) ?? null;
  const body = bodyOf(req);
  const access = readToken(String(body.token ?? ""));
  if (!access || Date.now() > access.until) return void json(res, 401, { error: "Нужен действующий доступ." }) ?? null;
  try {
    // Личный код мог быть отозван: ИИ стоит денег квоты, поэтому проверяем отзыв сразу, а не при следующем запуске приложения.
    if (access.order.startsWith("grant-") && !(await redis("HGET", "kr:grants", access.order.slice(6)))) return void json(res, 401, { error: "Доступ отозван." }) ?? null;
    if (!(await claimDevice(access.order, body.deviceId))) return void json(res, 403, { error: DEVICE_ERROR }) ?? null;
  } catch {
    return void json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." }) ?? null;
  }
  return { body, owner: ownerOf(access.order) };
}
