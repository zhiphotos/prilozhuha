import { randomInt } from "node:crypto";
import { redis } from "./redis.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const makeCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

/** Личный код доступа для почты (тот же, что выдаёт grants-admin). Повтор для той же почты возвращает уже выданный код. */
export async function issueGrant(email, note, days) {
  const mail = String(email).trim().toLowerCase();
  const all = await redis("HGETALL", "kr:grants");
  for (let i = 0; i + 1 < all.length; i += 2) {
    const item = JSON.parse(all[i + 1]);
    if (item.email === mail) return { code: all[i], email: mail, reused: true };
  }
  const code = makeCode();
  await redis("HSET", "kr:grants", code, JSON.stringify({ email: mail, at: Date.now(), note, ...(days ? { days } : {}) }));
  return { code, email: mail, reused: false };
}

export const revokeGrant = (code) => redis("HDEL", "kr:grants", String(code).toUpperCase());
