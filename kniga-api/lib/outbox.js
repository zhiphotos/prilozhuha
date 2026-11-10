import { redis } from "./redis.js";

// С российского сервера до Telegram не достучаться (и Telegram до него тоже), поэтому сам сервер ничего не отправляет.
// Сообщения для Дарины копятся здесь и приходят ей в ответе бота, когда она сама ему напишет.
export const notifyAdmin = (text) => redis("HSET", "kr:tg:outbox", `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, String(text).slice(0, 500));

export async function takeNotices() {
  const all = await redis("HGETALL", "kr:tg:outbox");
  const items = [];
  for (let i = 0; i + 1 < all.length; i += 2) items.push([all[i], all[i + 1]]);
  items.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [id] of items.slice(0, 20)) await redis("HDEL", "kr:tg:outbox", id);
  return items.slice(0, 20).map(([, text]) => text);
}
