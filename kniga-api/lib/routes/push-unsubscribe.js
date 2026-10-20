import { bodyOf, cors, json } from "../config.js";
import { subId } from "../push.js";
import { redis, redisConfigured } from "../redis.js";

// POST /api/push-unsubscribe { endpoint }  – человек выключил напоминания: стираем всё, что про него хранили.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 200, { ok: false });
  const { endpoint } = bodyOf(req);
  if (typeof endpoint === "string") await redis("HDEL", "kr:push", subId(endpoint));
  return json(res, 200, { ok: true });
}
