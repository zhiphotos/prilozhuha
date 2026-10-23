import { cors, json } from "../config.js";
import { pushConfigured, setupWebPush } from "../push.js";
import { pairs, redis, redisConfigured } from "../redis.js";

/**
 * Разовое объявление всем, кто включил напоминания (например, «открылась оплата»).
 *   GET /api/push-broadcast?key=<CRON_SECRET>&id=<имя-рассылки>&title=...&body=...&go=lessons[&dry=1]
 * - id обязателен: с одним и тем же id рассылка уходит один раз (повторный запрос отвечает «already sent»);
 * - dry=1 только считает получателей, ничего не отправляет и id не занимает;
 * - не трогает счётчики обычных напоминаний, время суток и «сегодня заходил» не учитывает: это объявление, а не напоминание.
 */
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const url = new URL(req.url, `https://${req.headers.host}`);
  const q = url.searchParams;
  const key = q.get("key") || String(req.headers["x-cron-key"] || "");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return json(res, 401, { error: "no" });
  if (!redisConfigured() || !pushConfigured()) return json(res, 503, { error: "not configured" });
  const id = (q.get("id") || "").replace(/[^\w-]/g, "").slice(0, 60);
  const title = (q.get("title") || "Книга рода").slice(0, 80);
  const body = (q.get("body") || "").slice(0, 240);
  const go = (q.get("go") || "home").replace(/[^\w]/g, "").slice(0, 20);
  const dry = q.get("dry") === "1";
  if (!id || !body) return json(res, 400, { error: "need id and body" });
  const all = pairs(await redis("HGETALL", "kr:push"));
  const result = { id, dry, recipients: Object.keys(all).length, sent: 0, removed: 0, errors: 0 };
  if (dry) return json(res, 200, result);
  const lock = await redis("SET", `kr:broadcast:${id}`, String(Date.now()), "NX");
  if (lock === null) return json(res, 409, { error: "already sent", id });
  const web = setupWebPush();
  const jobs = Object.entries(all).map(async ([sid, raw]) => {
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      const payload = JSON.stringify({ title, body, url: `${record.app}#/go/${go}` });
      await web.sendNotification(record.sub, payload, { TTL: 24 * 3600 });
      result.sent += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await redis("HDEL", "kr:push", sid);
        result.removed += 1;
      } else {
        result.errors += 1;
        console.error("[push-broadcast]", error?.statusCode ?? error?.message);
      }
    }
  });
  for (let i = 0; i < jobs.length; i += 25) await Promise.allSettled(jobs.slice(i, i + 25));
  // Ни одного доставленного и были ошибки: снимаем отметку, чтобы можно было повторить.
  if (result.sent === 0 && result.errors > 0) await redis("DEL", `kr:broadcast:${id}`);
  return json(res, 200, result);
}
