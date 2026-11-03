import { redis } from "../redis.js";
import { limits } from "./limits.js";

// Квоты считаются на сервере в Redis. Периоды по московскому времени (UTC+3), чтобы «дата обновления» была понятной.
const MSK = 3 * 3600000;
const TTL = 70 * 86400; // счётчики стираются сами

export function period(per, now = Date.now()) {
  const d = new Date(now + MSK);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
  const id = per === "day" ? `d${y}-${m + 1}-${day}` : `m${y}-${m + 1}`;
  const next = per === "day" ? Date.UTC(y, m, day + 1) : Date.UTC(y, m + 1, 1);
  return { id, resetAt: new Date(next - MSK).toISOString() };
}

const userKey = (owner, kind, pid) => `kr:ai:u:${owner}:${kind}:${pid}`;
const globalKey = (kind, pid) => `kr:ai:g:${kind}:${pid}`;

async function bump(key, amount) {
  const n = Number(await redis("INCRBY", key, amount));
  if (n === amount) await redis("EXPIRE", key, TTL);
  return n;
}

/** Зарезервировать расход. Сначала общий потолок, потом личный; при отказе всё возвращается назад.
 * { ok:true, release() } либо { ok:false, scope:"global"|"user", resetAt, left } */
export async function reserve(owner, kind, amount = 1, now = Date.now(), env = process.env) {
  const lim = limits(env)[kind];
  if (!lim) return { ok: false, scope: "kind", resetAt: null, left: 0 };
  const amt = Math.max(1, Math.ceil(Number(amount) || 1));
  const { id, resetAt } = period(lim.per, now);
  const gk = globalKey(kind, id), uk = userKey(owner, kind, id);
  const g = await bump(gk, amt);
  if (g > lim.global) {
    await bump(gk, -amt);
    return { ok: false, scope: "global", resetAt, left: 0 };
  }
  const u = await bump(uk, amt);
  if (u > lim.user) {
    await bump(uk, -amt);
    await bump(gk, -amt);
    return { ok: false, scope: "user", resetAt, left: Math.max(0, lim.user - (u - amt)) };
  }
  return { ok: true, resetAt, left: lim.user - u, release: async () => { await bump(uk, -amt); await bump(gk, -amt); } };
}

/** Остатки личных лимитов для показа в приложении. */
export async function usage(owner, now = Date.now(), env = process.env) {
  const out = {};
  for (const [kind, lim] of Object.entries(limits(env))) {
    const { id, resetAt } = period(lim.per, now);
    const used = Number((await redis("GET", userKey(owner, kind, id))) ?? 0);
    out[kind] = { per: lim.per, limit: lim.user, used: Math.min(used, lim.user), left: Math.max(0, lim.user - used), resetAt };
  }
  return out;
}

/** Защита от повторов: один и тот же requestId принимается один раз за 10 минут. */
export async function firstTime(owner, requestId) {
  const id = String(requestId ?? "").slice(0, 64);
  if (!id) return true;
  return (await redis("SET", `kr:ai:req:${owner}:${id}`, "1", "EX", 600, "NX")) === "OK";
}

/** Провайдер исчерпал бесплатную квоту: стоп до его сброса (UTC полночь для Cloudflare), без перехода на другой. */
export const downKey = (name) => `kr:ai:down:${name}`;
export async function markDown(name, now = Date.now()) {
  const next = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
  await redis("SET", downKey(name), String(next), "EX", Math.max(60, Math.ceil((next - now) / 1000)));
  return new Date(next).toISOString();
}
export async function downUntil(name) {
  const v = await redis("GET", downKey(name));
  return v ? new Date(Number(v)).toISOString() : null;
}
