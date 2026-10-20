import { randomInt } from "node:crypto";
import { resetDevices } from "../devices.js";
import { bodyOf, cors, json } from "../config.js";
import { pairs, redis, redisConfigured } from "../redis.js";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// GET  /api/grants-admin?key=CRON_SECRET            – список выданных кодов
// POST /api/grants-admin?key=… { emails: [...] }    – выдать каждому личный код (повтор для той же почты вернёт тот же код)
// POST /api/grants-admin?key=… { revoke: "CODE" }   – отозвать
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const url = new URL(req.url, `https://${req.headers.host}`);
  const key = url.searchParams.get("key") || "";
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return json(res, 401, { error: "no" });
  if (!redisConfigured()) return json(res, 503, { error: "not configured" });
  const all = pairs(await redis("HGETALL", "kr:grants"));
  const list = Object.entries(all).map(([code, raw]) => ({ code, ...JSON.parse(raw) }));
  if (req.method === "GET") return json(res, 200, { grants: list });
  const body = bodyOf(req);
  if (body.resetDevices) {
    // освободить места: код (8 символов) или id пользователя платформы
    const who = String(body.resetDevices);
    await resetDevices(who.length === 8 ? `grant-${who.toUpperCase()}` : `plat-${who}`);
    return json(res, 200, { ok: true });
  }
  if (body.revoke) {
    await redis("HDEL", "kr:grants", String(body.revoke).toUpperCase());
    return json(res, 200, { ok: true });
  }
  const out = [];
  for (const email of Array.isArray(body.emails) ? body.emails : []) {
    const mail = String(email).trim().toLowerCase();
    if (!mail) continue;
    let found = list.find((item) => item.email === mail);
    if (!found) {
      const code = makeCode();
      await redis("HSET", "kr:grants", code, JSON.stringify({ email: mail, at: Date.now(), note: String(body.note ?? "") }));
      found = { code, email: mail };
    }
    out.push({ email: mail, code: found.code });
  }
  return json(res, 200, { grants: out });
}
