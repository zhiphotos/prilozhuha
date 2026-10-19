// Локальный запуск всех функций одним сервером: `node dev-server.mjs` (порт 3000). Данные в памяти, пуши не отправляются.
import http from "node:http";
import { readdirSync } from "node:fs";
process.env.MEMORY_STORE ??= "1";
process.env.PUSH_DRY_RUN ??= "1";
process.env.VAPID_PUBLIC_KEY ??= "dev";
process.env.VAPID_PRIVATE_KEY ??= "dev";
process.env.CRON_SECRET ??= "dev-cron-secret-dev-cron";
process.env.ACCESS_SECRET ??= "dev-access-secret-dev-access-secret";
process.env.APP_ORIGINS ??= "http://localhost:8080,http://localhost:5173";
const routes = {};
for (const file of readdirSync(new URL("./api/", import.meta.url))) if (file.endsWith(".js")) routes[`/api/${file.slice(0, -3)}`] = (await import(`./api/${file}`)).default;
http
  .createServer((req, res) => {
    const path = new URL(req.url, "http://x").pathname;
    const handler = routes[path];
    if (!handler) return (res.statusCode = 404), res.end("not found");
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch {
        req.body = {};
      }
      handler(req, res);
    });
  })
  .listen(3000, () => console.log("API на http://localhost:3000"));
