import { createHmac, timingSafeEqual } from "node:crypto";
import { rawBodyOf, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { revokeGrant } from "../grants.js";
import { notifyAdmin } from "../outbox.js";

// POST /api/tribute-hook  – вебхук Tribute: оплата цифрового продукта. Подпись trbt-signature: HMAC-SHA256 тела ключом API (TRIBUTE_API_KEY).
// Запоминаем, какой Telegram-пользователь заплатил. Доступ выдаёт бот «Дед Привратник», когда этот человек пришлёт ему почту.
export const verify = (raw, signature, key) => {
  if (!key || !signature) return false;
  const expected = createHmac("sha256", key).update(raw, "utf8").digest("hex");
  const a = Buffer.from(String(signature).toLowerCase());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "not configured" });
  const raw = await rawBodyOf(req);
  if (!verify(raw, req.headers["trbt-signature"], process.env.TRIBUTE_API_KEY)) return json(res, 401, { error: "bad signature" });
  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return json(res, 400, { error: "bad json" });
  }
  const p = evt.payload ?? {};
  const tgId = String(p.telegram_user_id ?? "");
  const productId = String(p.product_id ?? "");
  const wanted = (process.env.TRIBUTE_PRODUCT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (wanted.length && productId && !wanted.includes(productId)) return json(res, 200, { status: "ignored" });

  if (evt.name === "new_digital_product") {
    if (!tgId) {
      await notifyAdmin(`Пришла оплата Трибьют без Telegram-номера (${p.amount ?? "?"} ${p.currency ?? ""}). Выдай ключ вручную.`);
      return json(res, 200, { status: "no-telegram" });
    }
    const purchase = String(p.purchase_id ?? p.id ?? `${tgId}-${productId}-${evt.created_at ?? ""}`);
    const prev = await redis("HGET", "kr:tg:paid", tgId);
    const record = prev ? JSON.parse(prev) : {};
    if (record.purchase !== purchase || record.refunded) {
      await redis("HSET", "kr:tg:paid", tgId, JSON.stringify({ ...record, purchase, productId, amount: p.amount, currency: p.currency, username: p.telegram_username ?? record.username, at: Date.now(), refunded: false }));
      await redis("HSET", "kr:tg:purchase", purchase, tgId);
      await notifyAdmin(`Оплатили через Трибьют${p.telegram_username ? ` (@${p.telegram_username})` : ""}: ${p.amount ?? "?"} ${p.currency ?? ""}. Дед Привратник ждёт от них почту и выдаст ключ сам.`);
    }
    return json(res, 200, { status: "ok" });
  }

  if (evt.name === "digital_product_refunded") {
    const purchase = String(p.purchase_id ?? p.id ?? "");
    const owner = tgId || (purchase ? await redis("HGET", "kr:tg:purchase", purchase) : "");
    const prev = owner ? await redis("HGET", "kr:tg:paid", String(owner)) : null;
    if (prev) {
      const record = JSON.parse(prev);
      if (record.code) await revokeGrant(record.code);
      await redis("HSET", "kr:tg:paid", String(owner), JSON.stringify({ ...record, refunded: true, refundSeen: false }));
      await notifyAdmin(`Вернули оплату Трибьют (${owner}). Ключ${record.code ? ` ${record.code}` : ""} отозван.`);
    }
    return json(res, 200, { status: "ok" });
  }
  return json(res, 200, { status: "ignored" });
}
