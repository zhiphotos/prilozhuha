import { alfaConfigured, createCheckout } from "../lib/alfa.js";
import { bodyOf, cors, isAllowedApp, json } from "../lib/config.js";

// POST /api/checkout { email, app }  ->  { url }  – адрес платёжной страницы Альфа-Банка
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!alfaConfigured()) return json(res, 503, { error: "Оплата ещё не подключена." });
  const { email, app, ads, legal } = bodyOf(req);
  const mail = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return json(res, 400, { error: "Укажите почту, на неё придёт чек." });
  if (!isAllowedApp(String(app ?? ""))) return json(res, 400, { error: "Неизвестный адрес приложения." });
  try {
    const base = `https://${req.headers["x-forwarded-host"] || req.headers.host}`;
    const appUrl = String(app).split("#")[0];
    const target = encodeURIComponent(appUrl);
    const result = await createCheckout({
      email: mail,
      ads: Boolean(ads),
      legal,
      returnUrl: `${base}/api/pay-return?to=${target}`,
      failUrl: `${appUrl}${appUrl.includes("?") ? "&" : "?"}paid=0`,
    });
    return json(res, 200, { url: result.formUrl });
  } catch (error) {
    console.error("[checkout]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Не получилось открыть оплату. Попробуйте ещё раз чуть позже." });
  }
}
