import { throttled } from "../throttle.js";
import { alfaConfigured, createCheckout } from "../alfa.js";
import { GIFT_NAME, bodyOf, cors, isAllowedApp, json } from "../config.js";
import { cleanCard, newGiftId, rememberGiftOrder, saveGift } from "../gift.js";

// POST /api/gift-checkout { email, app, from, to, message, card, ads, legal }  ->  { url }  – платёжная страница банка для подарка.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (await throttled(req, res, "gift-checkout", 30)) return;
  if (process.env.GIFT_ENABLED !== "1") return json(res, 503, { error: "Подарки пока недоступны." });
  if (!alfaConfigured()) return json(res, 503, { error: "Оплата ещё не подключена." });
  const body = bodyOf(req);
  const mail = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return json(res, 400, { error: "Укажите почту, на неё придёт чек и ссылка на подарок." });
  if (!isAllowedApp(String(body.app ?? ""))) return json(res, 400, { error: "Неизвестный адрес приложения." });
  const card = cleanCard(body);
  // Письмо получателю: сразу после оплаты или в выбранное время (не позже чем через год).
  const rcpt = String(body.recipientEmail ?? "").trim().toLowerCase().slice(0, 120);
  const recipientEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rcpt) ? rcpt : "";
  const at = Number(body.deliverAt);
  const deliverAt = recipientEmail && Number.isFinite(at) && at > Date.now() && at < Date.now() + 366 * 86400000 ? Math.round(at) : 0;
  const id = newGiftId();
  try {
    const base = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const appUrl = String(body.app).split("#")[0];
    const result = await createCheckout({
      email: mail,
      ads: Boolean(body.ads),
      legal: body.legal,
      item: { name: GIFT_NAME, code: "kniga-roda-gift" },
      returnUrl: `${base}/api/gift-return?to=${encodeURIComponent(appUrl)}&gift=${id}`,
      failUrl: `${appUrl}${appUrl.includes("?") ? "&" : "?"}paid=0`,
    });
    await saveGift(id, { id, status: "new", card, giverEmail: mail, recipientEmail, deliverAt, app: appUrl, orderId: result.orderId, orderNumber: result.orderNumber, at: Date.now() });
    await rememberGiftOrder(result.orderId, id);
    return json(res, 200, { url: result.formUrl });
  } catch (error) {
    console.error("[gift-checkout]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Не получилось открыть оплату. Попробуйте ещё раз чуть позже." });
  }
}
