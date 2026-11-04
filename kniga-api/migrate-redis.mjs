// Перенос данных из Upstash (REST) в свой Redis. Запускается один раз при переезде, ключи читаются, а не удаляются.
//   UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… REDIS_URL=redis://:пароль@127.0.0.1:6379 node migrate-redis.mjs [--dry]
// Переносит только ключи с префиксом kr: (книги, коды доступа, письма, push-подписки, комнаты, счётчики), строки, хэши и множества, со сроком жизни.
import { createNativeRedis } from "./lib/redis-native.js";

/** Скопировать один ключ. src/dst: (...команда) => результат. Возвращает тип или null, если ключ исчез по дороге. */
export async function copyKey(src, dst, key) {
  const type = await src("TYPE", key);
  const ttl = Number(await src("PTTL", key));
  if (type === "string") {
    const value = await src("GET", key);
    if (value === null) return null;
    await dst("SET", key, value);
  } else if (type === "hash") {
    const flat = await src("HGETALL", key);
    if (!flat?.length) return null;
    await dst("DEL", key);
    for (let i = 0; i < flat.length; i += 200) await dst("HSET", key, ...flat.slice(i, i + 200));
  } else if (type === "set") {
    const members = await src("SMEMBERS", key);
    if (!members?.length) return null;
    await dst("DEL", key);
    for (const m of members) await dst("SADD", key, m);
  } else {
    return null;
  }
  if (ttl > 0) await dst("PEXPIRE", key, ttl);
  return type;
}

export async function migrate(src, dst, { match = "kr:*", dry = false, log = console.log } = {}) {
  const counts = { string: 0, hash: 0, set: 0, skipped: 0 };
  let cursor = "0";
  do {
    const [next, keys] = await src("SCAN", cursor, "MATCH", match, "COUNT", 200);
    cursor = String(next);
    for (const key of keys) {
      if (dry) {
        const t = await src("TYPE", key);
        counts[t] = (counts[t] ?? 0) + 1;
        continue;
      }
      const t = await copyKey(src, dst, key);
      if (t) counts[t] += 1;
      else counts.skipped += 1;
    }
  } while (cursor !== "0");
  log(`${dry ? "Найдено" : "Перенесено"}: строк ${counts.string}, хэшей ${counts.hash}, множеств ${counts.set}, пропущено ${counts.skipped}`);
  return counts;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token || !process.env.REDIS_URL) {
    console.error("Нужны UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN и REDIS_URL.");
    process.exit(1);
  }
  const rest = async (...args) => {
    const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args.map(String)) });
    const data = await r.json();
    if (data.error) throw new Error(data.error);
    return data.result;
  };
  const target = createNativeRedis(process.env.REDIS_URL);
  await migrate(rest, (...a) => target.command(...a), { dry: process.argv.includes("--dry") });
  target.close();
}
