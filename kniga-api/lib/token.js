import { createHmac, timingSafeEqual } from "node:crypto";

// Токен доступа: kr1.<данные>.<подпись>. Подписан секретом сервера, поэтому подделать его на телефоне нельзя.
function secret() {
  const value = process.env.ACCESS_SECRET;
  if (!value || value.length < 24) throw new Error("ACCESS_SECRET не задан или короткий");
  return value;
}
const b64 = (buffer) => Buffer.from(buffer).toString("base64url");
const sign = (data) => createHmac("sha256", secret()).update(data).digest();

export function makeToken({ order, until }) {
  const data = b64(JSON.stringify({ o: order, x: until }));
  return `kr1.${data}.${b64(sign(data))}`;
}

export function readToken(token) {
  try {
    const [version, data, signature] = String(token).split(".");
    if (version !== "kr1" || !data || !signature) return null;
    const expected = sign(data);
    const given = Buffer.from(signature, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    if (typeof payload.o !== "string" || typeof payload.x !== "number") return null;
    return { order: payload.o, until: payload.x };
  } catch {
    return null;
  }
}
