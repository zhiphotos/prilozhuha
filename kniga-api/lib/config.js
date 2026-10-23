// Настройки сервера. Всё секретное только в переменных окружения Vercel, в коде секретов нет.
export const PRICE_RUB = Number(process.env.PRICE_RUB || 2026);
export const ACCESS_DAYS = Number(process.env.ACCESS_DAYS || 365);
export const PRODUCT_NAME = "Программа «Книга рода»: уроки и полный доступ в приложение";

/** Адреса приложения, которым разрешено обращаться к серверу и куда можно возвращать после оплаты. */
export function allowedOrigins() {
  return (process.env.APP_ORIGINS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
}

export function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function isAllowedApp(url) {
  const list = allowedOrigins();
  if (!list.length) return false;
  const origin = originOf(url);
  return Boolean(origin) && list.includes(origin);
}

export function cors(req, res) {
  const origin = String(req.headers.origin || "");
  if (origin && allowedOrigins().includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function bodyOf(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try {
    return JSON.parse(req.body || "{}");
  } catch {
    return {};
  }
}

/** Ключ планировщика: в адресе (?key=), в заголовке x-cron-key или как «Authorization: Bearer …» (так вызывает Vercel Cron). */
export function cronAuthorized(req, url) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const key = url.searchParams.get("key") || String(req.headers["x-cron-key"] || "") || bearer;
  return key === secret;
}
