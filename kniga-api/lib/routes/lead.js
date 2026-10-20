import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";

// POST /api/lead { email, consent }  – «сообщите, когда откроется покупка». Согласие на обработку обязательно.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "Сервер пока не подключён." });
  const { email, consent } = bodyOf(req);
  const mail = String(email ?? "").trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return json(res, 400, { error: "Проверьте почту." });
  if (consent !== true) return json(res, 400, { error: "Нужно согласие на обработку данных." });
  await redis("HSET", "kr:leads", mail, JSON.stringify({ at: Date.now() }));
  return json(res, 200, { ok: true });
}
