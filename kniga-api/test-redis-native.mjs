// Проверка своего клиента Redis: поддельный сервер RESP на памяти. `node test-redis-native.mjs`
import net from "node:net";
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
process.env.MEMORY_STORE = "1"; // memoryRedis ниже работает на памяти
const { memoryRedis } = await import("./lib/redis.js");
const { createNativeRedis, createParser, encode } = await import("./lib/redis-native.js");

const enc = (v) => {
  if (v === null) return "$-1\r\n";
  if (typeof v === "number") return `:${v}\r\n`;
  if (Array.isArray(v)) return `*${v.length}\r\n${v.map(enc).join("")}`;
  return `$${Buffer.byteLength(String(v))}\r\n${v}\r\n`;
};
const PASSWORD = "секрет";
let seen = [];
/** Одна команда из потока байт: { args, used } или null, если байтов ещё мало. */
function takeCommand(buf) {
  const lineEnd = (at) => buf.indexOf("\r\n", at);
  if (buf.length === 0 || buf[0] !== 0x2a) return null;
  let e = lineEnd(0);
  if (e === -1) return null;
  const n = Number(buf.toString("utf8", 1, e));
  let pos = e + 2;
  const args = [];
  for (let i = 0; i < n; i += 1) {
    e = lineEnd(pos);
    if (e === -1) return null;
    const len = Number(buf.toString("utf8", pos + 1, e));
    const start = e + 2;
    if (buf.length < start + len + 2) return null;
    args.push(buf.toString("utf8", start, start + len));
    pos = start + len + 2;
  }
  return { args, used: pos };
}
const server = net.createServer((sock) => {
  let authed = false;
  let buf = Buffer.alloc(0);
  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (let cmd = takeCommand(buf); cmd; cmd = takeCommand(buf)) {
      buf = buf.subarray(cmd.used);
      const { args } = cmd;
      const op = args[0].toUpperCase();
      seen.push(op);
      if (op === "AUTH") { authed = args[1] === PASSWORD; sock.write(authed ? "+OK\r\n" : "-ERR invalid password\r\n"); continue; }
      if (!authed) { sock.write("-NOAUTH Authentication required.\r\n"); continue; }
      if (op === "BOOM") { sock.write("-ERR unknown command 'BOOM'\r\n"); continue; }
      try {
        const out = memoryRedis(args);
        sock.write(op === "SET" ? "+OK\r\n" : op === "HSET" || op === "EXPIRE" ? ":1\r\n" : enc(out));
      } catch (error) {
        sock.write(`-ERR ${error.message}\r\n`);
      }
    }
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

// 1. разбор ответов по кускам
{
  const got = [];
  const feed = createParser((v) => got.push(v));
  const bytes = Buffer.from("+OK\r\n:42\r\n$12\r\nпривет\r\n*3\r\n$1\r\na\r\n$-1\r\n:7\r\n-ERR плохо\r\n");
  for (let i = 0; i < bytes.length; i += 3) feed(bytes.subarray(i, i + 3));
  ok("разбор: простая строка, число, строка по-русски, массив с пустым, ошибка, всё кусками", got[0] === "OK" && got[1] === 42 && got[2] === "привет" && JSON.stringify(got[3]) === '["a",null,7]' && got[4] instanceof Error && got[4].message === "ERR плохо");
  ok("кодирование команды считает байты, а не символы", encode(["SET", "к", "я"]) === "*3\r\n$3\r\nSET\r\n$2\r\nк\r\n$2\r\nя\r\n");
}

// 2. пароль
{
  const bad = createNativeRedis(`redis://:wrong@127.0.0.1:${port}`);
  let failed = false;
  try { await bad.command("GET", "x"); } catch { failed = true; }
  bad.close();
  ok("неверный пароль: команда не выполняется", failed);
}

// 3. основные команды и параллельные запросы
const r = createNativeRedis(`redis://:${encodeURIComponent(PASSWORD)}@127.0.0.1:${port}`);
ok("SET и GET", (await r.command("SET", "k", "значение")) === "OK" && (await r.command("GET", "k")) === "значение");
ok("GET несуществующего ключа даёт null", (await r.command("GET", "нет")) === null);
await r.command("HSET", "h", "a", "1", "b", "2");
ok("HGETALL возвращает плоский массив, как у Upstash", JSON.stringify(await r.command("HGETALL", "h")) === '["a","1","b","2"]');
ok("HMGET с пропуском", JSON.stringify(await r.command("HMGET", "h", "a", "zzz")) === '["1",null]');
const incs = await Promise.all(Array.from({ length: 50 }, () => r.command("INCR", "n")));
ok("50 параллельных INCR идут по порядку без потерь", incs.every((v, i) => v === i + 1));
const big = "ж".repeat(700_000);
await r.command("SET", "big", big);
ok("большое значение (700 тыс. символов, около 1,4 МБ) приходит целиком", (await r.command("GET", "big")) === big);
let err = null;
try { await r.command("BOOM"); } catch (e) { err = e; }
ok("ошибка Redis приходит как исключение, соединение живо", err instanceof Error && (await r.command("GET", "k")) === "значение");

// 4. обрыв соединения: следующая команда открывает новое
r.close();
ok("после close клиент сам открывает новое соединение", (await r.command("GET", "k")) === "значение");
r.close();

// 5. redis.js выбирает свой Redis по REDIS_URL
{
  delete process.env.MEMORY_STORE;
  process.env.REDIS_URL = `redis://:${encodeURIComponent(PASSWORD)}@127.0.0.1:${port}`;
  const mod = await import("./lib/redis.js?native");
  ok("redisConfigured видит REDIS_URL", mod.redisConfigured() === true);
  await mod.redis("SET", "via", "redis.js");
  ok("redis() ходит в свой Redis, а не в память и не в Upstash", (await mod.redis("GET", "via")) === "redis.js" && seen.includes("GET"));
}

server.close();
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
process.exit(process.exitCode ?? 0);
