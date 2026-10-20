import { orderState } from "../alfa.js";
import { bodyOf, cors, json } from "../config.js";
import { claimDevice } from "../devices.js";
import { redis, redisConfigured } from "../redis.js";
import { readToken } from "../token.js";
import { platformUntil } from "./platform-login.js";

// POST /api/verify { token, deviceId }  – доступ ещё действует? Три вида доступа:
//   kr-…   оплата в банке (срок, возврат денег)
//   grant- личный код (пока Дарина его не отозвала)
//   plat-  аккаунт платформы (курс не снят на платформе)
// Везде не больше двух устройств на один доступ.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const body = bodyOf(req);
  const data = readToken(String(body.token ?? ""));
  if (!data) return json(res, 200, { valid: false });
  if (Date.now() > data.until) return json(res, 200, { valid: false, reason: "expired" });
  try {
    if (!(await claimDevice(data.order, body.deviceId))) return json(res, 200, { valid: false, reason: "devices" });
  } catch {
    /* сбой хранилища доступ не отнимает */
  }

  if (data.order.startsWith("plat-")) {
    // Доступ с платформы: спрашиваем у платформы, не снят ли он (возврат, отзыв). Сбой сети доступ не отнимает.
    const uid = data.order.slice(5);
    try {
      const raw = redisConfigured() ? await redis("HGET", "kr:plat", uid) : null;
      if (!raw) return json(res, 200, { valid: true, until: data.until, unchecked: true });
      const record = JSON.parse(raw);
      const url = process.env.PLATFORM_SUPABASE_URL;
      const anon = process.env.PLATFORM_SUPABASE_ANON_KEY;
      const refreshed = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: record.rt }) });
      const session = await refreshed.json().catch(() => ({}));
      if (refreshed.status >= 500) return json(res, 200, { valid: true, until: data.until, unchecked: true });
      if (!refreshed.ok || !session.access_token) return json(res, 200, { valid: false, reason: "relogin" });
      await redis("HSET", "kr:plat", uid, JSON.stringify({ ...record, rt: session.refresh_token ?? record.rt }));
      const until = await platformUntil(session.access_token);
      return json(res, 200, { valid: until > Date.now(), until: Math.min(until, data.until) });
    } catch {
      return json(res, 200, { valid: true, until: data.until, unchecked: true });
    }
  }

  if (data.order.startsWith("grant-")) {
    // Личный код: действует, пока Дарина его не отозвала.
    try {
      const alive = redisConfigured() ? Boolean(await redis("HGET", "kr:grants", data.order.slice(6))) : true;
      return json(res, 200, { valid: alive, until: data.until });
    } catch {
      return json(res, 200, { valid: true, until: data.until, unchecked: true });
    }
  }

  try {
    const state = await orderState({ orderNumber: data.order });
    return json(res, 200, { valid: state.ok && !state.refunded, until: data.until });
  } catch {
    // Банк не ответил: не отнимаем доступ из-за чужого сбоя.
    return json(res, 200, { valid: true, until: data.until, unchecked: true });
  }
}
