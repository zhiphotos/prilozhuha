import { redis } from "./redis.js";

/** Что оплачено на эту почту: оплата в банке или личный код ученицы. null, если ничего нет. */
export async function accessOfMail(mail) {
  const paid = await redis("HGET", "kr:paid", mail);
  if (paid) {
    const p = JSON.parse(paid);
    return { kind: "paid", order: String(p.order), until: Number(p.until) };
  }
  const all = (await redis("HGETALL", "kr:grants")) ?? [];
  for (let i = 0; i + 1 < all.length; i += 2) {
    const g = JSON.parse(all[i + 1]);
    if (String(g.email ?? "").toLowerCase() !== mail) continue;
    const until = Number(g.at || Date.now()) + Number(g.days || 365) * 86400000;
    if (until > Date.now()) return { kind: "grant", order: `grant-${all[i]}`, until };
  }
  return null;
}
