import { bodyOf, cors, isAllowedApp, json } from "../config.js";
import { subId, validSubscription } from "../push.js";
import { redis, redisConfigured } from "../redis.js";

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Статистика приложения нужна только для выбора подходящего напоминания. Лишнего не берём. */
export const cleanStats = (stats) => ({
  people: clampInt(stats?.people, 0, 9999, 0),
  pages: clampInt(stats?.pages, 0, 9999, 0),
  lessonsDone: clampInt(stats?.lessonsDone, 0, 6, 0),
  paid: Boolean(stats?.paid),
});

// POST /api/push-subscribe { subscription, hour, offsetMin, days, app, stats }
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "Напоминания ещё не подключены." });
  const body = bodyOf(req);
  if (!validSubscription(body.subscription)) return json(res, 400, { error: "Подписка не подошла." });
  if (!isAllowedApp(String(body.app ?? ""))) return json(res, 400, { error: "Неизвестный адрес приложения." });
  const id = subId(body.subscription.endpoint);
  const old = await redis("HGET", "kr:push", id).then((raw) => (raw ? JSON.parse(raw) : null)).catch(() => null);
  const days = Array.isArray(body.days) ? [...new Set(body.days.map((d) => clampInt(d, 0, 6, -1)).filter((d) => d >= 0))] : [2, 4, 0];
  const record = {
    sub: { endpoint: body.subscription.endpoint, keys: { p256dh: body.subscription.keys.p256dh, auth: body.subscription.keys.auth } },
    hour: clampInt(body.hour, 6, 23, 19),
    offsetMin: clampInt(body.offsetMin, -720, 840, 180),
    days: days.length ? days : [2, 4, 0],
    app: String(body.app).split("#")[0],
    stats: cleanStats(body.stats),
    lastSeen: Date.now(),
    lastSent: old?.lastSent ?? 0,
    seq: old?.seq ?? 0,
    created: old?.created ?? Date.now(),
  };
  await redis("HSET", "kr:push", id, JSON.stringify(record));
  return json(res, 200, { ok: true });
}
