import { cors, json } from "../config.js";
import { runBroadcast } from "../broadcast.js";
import { pushConfigured } from "../push.js";
import { redis, redisConfigured } from "../redis.js";

/**
 * Разовое объявление всем, кто включил напоминания (например, «открылась оплата»).
 *   GET /api/push-broadcast?key=<CRON_SECRET>&id=<имя-рассылки>&title=...&body=...&go=lessons[&dry=1][&at=<unix-мс>]
 * - id обязателен: с одним и тем же id рассылка уходит один раз;
 * - dry=1 только считает получателей;
 * - at: время отправки (миллисекунды Unix). Сервер хранит план и сам отправит его при ближайшем почасовом запуске push-tick,
 *   компьютер и сессия при этом не нужны;
 * - не трогает счётчики обычных напоминаний.
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
  const at = Number(q.get("at") || 0);
  if (!id || !body) return json(res, 400, { error: "need id and body" });
  if (!dry && at > Date.now()) {
    if (await redis("GET", `kr:broadcast:${id}`)) return json(res, 409, { error: "already sent", id });
    await redis("SET", `kr:broadcast:plan:${id}`, JSON.stringify({ at, title, body, go }));
    await redis("SADD", "kr:broadcast:plans", id);
    return json(res, 200, { id, scheduled: true, at: new Date(at).toISOString() });
  }
  const { status, result } = await runBroadcast({ id, title, body, go, dry });
  return json(res, status, result);
}
