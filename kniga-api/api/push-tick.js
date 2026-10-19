import { cors, json } from "../lib/config.js";
import { pickMessage } from "../lib/push-messages.js";
import { pushConfigured, setupWebPush } from "../lib/push.js";
import { pairs, redis, redisConfigured } from "../lib/redis.js";

/**
 * Раз в час вызывается внешним планировщиком (cron-job.org, QStash и т. п.):
 *   GET /api/push-tick?key=<CRON_SECRET>
 * Отправляет напоминание тем, у кого сейчас выбранный час по их времени и выбранный день недели,
 * кто сегодня уже не получал напоминание и не открывал приложение. Не больше одного в день.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const url = new URL(req.url, `https://${req.headers.host}`);
  const key = url.searchParams.get("key") || String(req.headers["x-cron-key"] || "");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return json(res, 401, { error: "no" });
  if (!redisConfigured() || (!pushConfigured() && process.env.PUSH_DRY_RUN !== "1")) return json(res, 503, { error: "not configured" });
  const dry = process.env.PUSH_DRY_RUN === "1";
  const now = Date.now();
  const all = pairs(await redis("HGETALL", "kr:push"));
  const result = { checked: 0, sent: 0, skipped: 0, removed: 0, errors: 0, sample: [] };
  const web = dry ? null : setupWebPush();
  const jobs = Object.entries(all).map(async ([id, raw]) => {
    result.checked += 1;
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      await redis("HDEL", "kr:push", id);
      return;
    }
    const local = new Date(now + record.offsetMin * 60000);
    const dateKey = local.toISOString().slice(0, 10);
    const dayKey = (t) => new Date(t + record.offsetMin * 60000).toISOString().slice(0, 10);
    if (local.getUTCHours() !== record.hour || !record.days.includes(local.getUTCDay()) || (record.lastSent && dayKey(record.lastSent) === dateKey) || (record.lastSeen && dayKey(record.lastSeen) === dateKey)) {
      result.skipped += 1;
      return;
    }
    const message = pickMessage(record, now);
    if (!message) {
      result.skipped += 1;
      return;
    }
    try {
      const payload = JSON.stringify({ title: message.title, body: message.body, url: `${record.app}#/go/${message.go}` });
      if (!dry) await web.sendNotification(record.sub, payload, { TTL: 6 * 3600 });
      record.lastSent = now;
      record.seq = Number(record.seq ?? 0) + 1;
      await redis("HSET", "kr:push", id, JSON.stringify(record));
      result.sent += 1;
      if (dry) result.sample.push(message.title);
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await redis("HDEL", "kr:push", id);
        result.removed += 1;
      } else {
        result.errors += 1;
        console.error("[push-tick]", error?.statusCode ?? error?.message);
      }
    }
  });
  for (let i = 0; i < jobs.length; i += 25) await Promise.allSettled(jobs.slice(i, i + 25));
  return json(res, 200, result);
}
