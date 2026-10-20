import { ROUTES } from "../lib/routes/index.js";

// Одна функция на все адреса /api/<имя>: так укладываемся в лимит бесплатного тарифа Vercel.
export default async function handler(req, res) {
  const name = new URL(req.url, "http://x").pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  const route = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null;
  if (!route) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ error: "not found" }));
  }
  return route(req, res);
}
