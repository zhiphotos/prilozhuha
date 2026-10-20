import { bodyOf, cors, json } from "../config.js";
import { subId } from "../push.js";
import { redis, redisConfigured } from "../redis.js";
import { cleanStats } from "./push-subscribe.js";

// POST /api/push-ping { endpoint, stats }  – человек открыл приложение: напоминание в этот день не нужно, статистика для выбора текста обновляется.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 200, { ok: false });
  const body = bodyOf(req);
  if (typeof body.endpoint !== "string") return json(res, 200, { ok: false });
  const id = subId(body.endpoint);
  const raw = await redis("HGET", "kr:push", id).catch(() => null);
  if (!raw) return json(res, 200, { ok: false });
  const record = JSON.parse(raw);
  record.lastSeen = Date.now();
  record.stats = cleanStats(body.stats ?? record.stats);
  await redis("HSET", "kr:push", id, JSON.stringify(record));
  return json(res, 200, { ok: true });
}
