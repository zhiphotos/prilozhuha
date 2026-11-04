// Клиент обычного Redis по TCP (протокол RESP2), без зависимостей. Нужен для своего сервера: Upstash по REST там не нужен.
// Адрес: REDIS_URL=redis://[:пароль@]хост:порт[/номер_базы]. Команды идут по одному соединению по очереди, при обрыве оно открывается заново.
import net from "node:net";
import tls from "node:tls";

/** Разбор ответов RESP. Возвращает ответы по мере поступления байт. */
export function createParser(onReply) {
  let buf = Buffer.alloc(0);
  const line = (at) => {
    const end = buf.indexOf("\r\n", at);
    return end === -1 ? null : { text: buf.toString("utf8", at, end), next: end + 2 };
  };
  // Возвращает { value, next } или null, если данных не хватает.
  const read = (at) => {
    if (at >= buf.length) return null;
    const type = String.fromCharCode(buf[at]);
    const l = line(at + 1);
    if (!l) return null;
    if (type === "+") return { value: l.text, next: l.next };
    if (type === "-") return { value: new Error(l.text), next: l.next };
    if (type === ":") return { value: Number(l.text), next: l.next };
    if (type === "$") {
      const n = Number(l.text);
      if (n === -1) return { value: null, next: l.next };
      if (buf.length < l.next + n + 2) return null;
      return { value: buf.toString("utf8", l.next, l.next + n), next: l.next + n + 2 };
    }
    if (type === "*") {
      const n = Number(l.text);
      if (n === -1) return { value: null, next: l.next };
      const items = [];
      let pos = l.next;
      for (let i = 0; i < n; i += 1) {
        const item = read(pos);
        if (!item) return null;
        items.push(item.value);
        pos = item.next;
      }
      return { value: items, next: pos };
    }
    throw new Error(`Неизвестный ответ Redis: ${type}`);
  };
  return (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      const got = read(0);
      if (!got) return;
      buf = buf.subarray(got.next);
      onReply(got.value);
    }
  };
}

export const encode = (args) => {
  const parts = [`*${args.length}\r\n`];
  for (const a of args) {
    const s = String(a);
    parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`);
  }
  return parts.join("");
};

export function createNativeRedis(url, { timeoutMs = 8000 } = {}) {
  const u = new URL(url);
  const port = Number(u.port || 6379);
  const host = u.hostname;
  const password = decodeURIComponent(u.password || "");
  const db = u.pathname && u.pathname !== "/" ? Number(u.pathname.slice(1)) : 0;
  const secure = u.protocol === "rediss:";
  let socket = null;
  let ready = null;
  const waiting = []; // очередь ожидающих ответов

  const fail = (error) => {
    for (const w of waiting.splice(0)) w.reject(error);
    socket?.destroy();
    socket = null;
    ready = null;
  };

  const open = () =>
    (ready ??= new Promise((resolve, reject) => {
      const s = (secure ? tls : net).connect({ host, port });
      socket = s;
      const parse = createParser((reply) => {
        const w = waiting.shift();
        if (!w) return;
        if (reply instanceof Error) w.reject(reply);
        else w.resolve(reply);
      });
      // Старое соединение (после close или обрыва) уже ни на что не влияет.
      s.on("data", (chunk) => {
        if (s !== socket) return;
        try {
          parse(chunk);
        } catch (error) {
          fail(error);
        }
      });
      s.on("error", (error) => {
        reject(error);
        if (s === socket) fail(error);
      });
      s.on("close", () => {
        if (s === socket) fail(new Error("Соединение с Redis закрыто."));
      });
      s.once(secure ? "secureConnect" : "connect", async () => {
        try {
          resolve();
          // Обе команды уходят сразу друг за другом, раньше любых других.
          const first = [];
          if (password) first.push(send(["AUTH", password], true));
          if (db) first.push(send(["SELECT", db], true));
          await Promise.all(first);
        } catch (error) {
          fail(error);
        }
      });
    }));

  function send(args, skipOpen = false) {
    return new Promise((resolve, reject) => {
      const go = () => {
        const timer = setTimeout(() => fail(new Error("Redis не ответил вовремя.")), timeoutMs);
        waiting.push({ resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)) });
        socket.write(encode(args));
      };
      if (skipOpen) return go();
      open().then(go, reject);
    });
  }

  return {
    command: (...args) => send(args),
    close: () => {
      socket?.end();
      socket = null;
      ready = null;
    },
  };
}
