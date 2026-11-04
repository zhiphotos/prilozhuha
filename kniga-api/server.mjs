// Боевой запуск всех адресов /api/* одним Node-процессом (российский сервер за nginx). Переменные окружения: см. deploy/ru/env.example.
// Слушает только 127.0.0.1: наружу его выставляет nginx, он же ставит заголовок x-forwarded-for для лимитов по адресу.
import http from "node:http";

const { ROUTES } = await import("./lib/routes/index.js");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY = 3 * 1024 * 1024; // части книги до 700 тыс. знаков, с запасом
const routes = Object.fromEntries(Object.entries(ROUTES).map(([name, handler]) => [`/api/${name}`, handler]));

const server = http.createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname.replace(/\/$/, "");
  if (path === "/health") return void res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
  const handler = Object.hasOwn(routes, path) ? routes[path] : null;
  if (!handler) return void res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }));
  let size = 0;
  const chunks = [];
  let tooBig = false;
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      tooBig = true;
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", async () => {
    if (tooBig) return void res.writeHead(413, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Слишком большой запрос." }));
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = {};
    }
    try {
      await handler(req, res);
    } catch (error) {
      console.error("[server]", path, error instanceof Error ? error.message : error);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Ошибка сервера." }));
    }
  });
});
server.requestTimeout = 60_000;
server.listen(PORT, HOST, () => console.log(`kniga-api: http://${HOST}:${PORT}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
