// Upstash Redis по REST (без лишних зависимостей). Для проверок без интернета: MEMORY_STORE=1, всё живёт в памяти.
const mem = { kv: new Map(), hash: new Map(), set: new Map() };

function memory(args) {
  const [op, key, ...rest] = args.map(String);
  const O = op.toUpperCase();
  const h = () => (mem.hash.get(key) ?? mem.hash.set(key, new Map()).get(key));
  const s = () => (mem.set.get(key) ?? mem.set.set(key, new Set()).get(key));
  switch (O) {
    case "GET": return mem.kv.get(key) ?? null;
    case "SET": if (rest.slice(1).map((x) => x.toUpperCase()).includes("NX") && mem.kv.has(key)) return null; mem.kv.set(key, rest[0]); return "OK";
    case "DEL": return mem.kv.delete(key) | mem.hash.delete(key) | mem.set.delete(key) ? 1 : 0;
    case "INCR": { const n = Number(mem.kv.get(key) ?? 0) + 1; mem.kv.set(key, String(n)); return n; }
    case "EXPIRE": return 1;
    case "HSET": for (let i = 0; i + 1 < rest.length; i += 2) h().set(rest[i], rest[i + 1]); return 1;
    case "HMGET": return rest.map((f) => h().get(f) ?? null);
    case "HEXISTS": return h().has(rest[0]) ? 1 : 0;
    case "EXISTS": return mem.kv.has(key) ? 1 : 0;
    case "HGET": return h().get(rest[0]) ?? null;
    case "HDEL": return h().delete(rest[0]) ? 1 : 0;
    case "HLEN": return h().size;
    case "HGETALL": return [...h().entries()].flat();
    case "SADD": s().add(rest[0]); return 1;
    case "SREM": return s().delete(rest[0]) ? 1 : 0;
    case "SMEMBERS": return [...s()];
    default: throw new Error(`memory redis: ${O}`);
  }
}

// Подключение через Vercel Marketplace кладёт ключи под именами KV_REST_API_*, ручное под UPSTASH_REDIS_REST_*: принимаем оба.
const restUrl = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const restToken = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export async function redis(...args) {
  const url = restUrl();
  const token = restToken();
  if (process.env.MEMORY_STORE === "1") return memory(args);
  if (!url || !token) throw new Error("redis not configured");
  const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args.map(String)) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export const redisConfigured = () => process.env.MEMORY_STORE === "1" || Boolean(restUrl() && restToken());

/** HGETALL → объект. */
export const pairs = (flat) => {
  const out = {};
  for (let i = 0; i + 1 < flat.length; i += 2) out[flat[i]] = flat[i + 1];
  return out;
};
