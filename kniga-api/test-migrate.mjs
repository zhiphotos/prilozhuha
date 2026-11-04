// Проверка переноса данных на двух поддельных хранилищах. `node test-migrate.mjs`
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const { migrate, copyKey } = await import("./migrate-redis.mjs");
const store = () => {
  const kv = new Map(), hash = new Map(), set = new Map(), ttl = new Map();
  const call = async (op, key, ...rest) => {
    op = op.toUpperCase();
    if (op === "SCAN") { const [, , pattern] = [key, ...rest]; const keys = [...kv.keys(), ...hash.keys(), ...set.keys()].filter((k) => k.startsWith(pattern.replace("*", ""))); return ["0", keys]; }
    if (op === "TYPE") return kv.has(key) ? "string" : hash.has(key) ? "hash" : set.has(key) ? "set" : "none";
    if (op === "PTTL") return ttl.get(key) ?? -1;
    if (op === "PEXPIRE") { ttl.set(key, Number(rest[0])); return 1; }
    if (op === "GET") return kv.get(key) ?? null;
    if (op === "SET") { kv.set(key, rest[0]); return "OK"; }
    if (op === "HGETALL") return [...(hash.get(key) ?? new Map()).entries()].flat();
    if (op === "HSET") { const h = hash.get(key) ?? hash.set(key, new Map()).get(key); for (let i = 0; i < rest.length; i += 2) h.set(rest[i], rest[i + 1]); return 1; }
    if (op === "SMEMBERS") return [...(set.get(key) ?? [])];
    if (op === "SADD") { (set.get(key) ?? set.set(key, new Set()).get(key)).add(rest[0]); return 1; }
    if (op === "DEL") { kv.delete(key); hash.delete(key); set.delete(key); return 1; }
    throw new Error(op);
  };
  return { call, kv, hash, set, ttl };
};
const a = store(), b = store();
await a.call("SET", "kr:book:1:part:1:0", "r:{\"p\":\"привет\"}"); await a.call("PEXPIRE", "kr:book:1:part:1:0", 5000);
for (let i = 0; i < 450; i += 1) await a.call("HSET", "kr:grants", `CODE${i}`, JSON.stringify({ i }));
await a.call("SADD", "kr:rooms", "r1"); await a.call("SADD", "kr:rooms", "r2");
await a.call("SET", "чужой:ключ", "не переносить");
const logs = [];
const dry = await migrate(a.call, b.call, { dry: true, log: (m) => logs.push(m) });
ok("пробный запуск ничего не пишет", b.kv.size === 0 && b.hash.size === 0 && dry.hash === 1);
const res = await migrate(a.call, b.call, { log: (m) => logs.push(m) });
ok("строка перенесена вместе со сроком жизни", b.kv.get("kr:book:1:part:1:0") === "r:{\"p\":\"привет\"}" && b.ttl.get("kr:book:1:part:1:0") === 5000);
ok("хэш на 450 записей перенесён целиком", b.hash.get("kr:grants")?.size === 450);
ok("множество перенесено", b.set.get("kr:rooms")?.size === 2);
ok("ключи без префикса kr: не трогаются", !b.kv.has("чужой:ключ"));
await migrate(a.call, b.call, { log: () => {} });
ok("повторный запуск не дублирует данные", b.hash.get("kr:grants")?.size === 450 && b.set.get("kr:rooms")?.size === 2 && res.string === 1);
ok("исчезнувший ключ пропускается без ошибки", (await copyKey(a.call, b.call, "kr:нет")) === null);
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
