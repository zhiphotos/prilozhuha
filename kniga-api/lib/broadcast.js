import { pushConfigured, setupWebPush } from "./push.js";
import { pairs, redis } from "./redis.js";

/** Разовое объявление всем подписчикам напоминаний. Один и тот же id уходит один раз. */
export async function runBroadcast({ id, title, body, go, dry = false }) {
  const all = pairs(await redis("HGETALL", "kr:push"));
  const result = { id, dry, recipients: Object.keys(all).length, sent: 0, removed: 0, errors: 0 };
  if (dry) return { status: 200, result };
  if (!pushConfigured()) return { status: 503, result: { error: "not configured" } };
  let web;
  try {
    web = setupWebPush();
  } catch (error) {
    console.error("[broadcast] vapid", error?.message);
    return { status: 503, result: { error: "push keys invalid" } };
  }
  const lock = await redis("SET", `kr:broadcast:${id}`, String(Date.now()), "NX");
  if (lock === null) return { status: 409, result: { error: "already sent", id } };
  const jobs = Object.entries(all).map(async ([sid, raw]) => {
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      return;
    }
    try {
      await web.sendNotification(record.sub, JSON.stringify({ title, body, url: `${record.app}#/go/${go}` }), { TTL: 24 * 3600 });
      result.sent += 1;
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await redis("HDEL", "kr:push", sid);
        result.removed += 1;
      } else {
        result.errors += 1;
        console.error("[broadcast]", error?.statusCode ?? error?.message);
      }
    }
  });
  for (let i = 0; i < jobs.length; i += 25) await Promise.allSettled(jobs.slice(i, i + 25));
  if (result.sent === 0 && result.errors > 0) await redis("DEL", `kr:broadcast:${id}`);
  return { status: 200, result };
}

/** Отправляет запланированные объявления, срок которых пришёл. Вызывается из почасового push-tick. */
export async function runDueBroadcasts(now = Date.now()) {
  const done = [];
  let ids = [];
  try {
    ids = (await redis("SMEMBERS", "kr:broadcast:plans")) ?? [];
  } catch {
    return done;
  }
  for (const id of ids) {
    let plan = null;
    try {
      plan = JSON.parse((await redis("GET", `kr:broadcast:plan:${id}`)) ?? "null");
    } catch {
      /* битая запись */
    }
    if (!plan) {
      await redis("SREM", "kr:broadcast:plans", id);
      continue;
    }
    if (plan.at > now) continue;
    const { status, result } = await runBroadcast({ id, title: plan.title, body: plan.body, go: plan.go });
    // Не вышло ни одной доставки: оставляем план до следующего часа (в течение суток), иначе убираем.
    const failed = status === 503 || (result.sent === 0 && result.errors > 0 && now < plan.at + 24 * 3600 * 1000);
    if (!failed) {
      await redis("SREM", "kr:broadcast:plans", id);
      await redis("DEL", `kr:broadcast:plan:${id}`);
    }
    done.push({ id, status, ...result });
  }
  return done;
}
