import { json } from "./config.js";
import { limited } from "./room.js";
import { redisConfigured } from "./redis.js";

/** Суточный потолок обращений с одного адреса (адрес хранится только хешем). true = запрос остановлен, ответ 429 уже отправлен.
 * Если хранилище не подключено или не ответило, не блокируем людей: это защита от злоупотреблений, а не проверка доступа. */
export async function throttled(req, res, bucket, max) {
  if (!redisConfigured()) return false;
  let blocked = false;
  try {
    blocked = await limited(req, bucket, max);
  } catch {
    return false;
  }
  if (blocked) json(res, 429, { error: "Слишком много обращений. Попробуйте завтра или напишите в поддержку." });
  return blocked;
}
