// Запуск боевого сервера и проверка адресов. `node test-server.mjs`
import { spawn } from "node:child_process";
const ok = (name, cond) => { console.log(cond ? "ok  " : "FAIL", name); if (!cond) process.exitCode = 1; };
const PORT = 3917;
const child = spawn(process.execPath, ["server.mjs"], { env: { ...process.env, PORT: String(PORT), MEMORY_STORE: "1", APP_ORIGINS: "https://app.example", ACCESS_SECRET: "s".repeat(40), CRON_SECRET: "c".repeat(24) }, stdio: ["ignore", "pipe", "inherit"] });
await new Promise((resolve) => child.stdout.on("data", (d) => String(d).includes("kniga-api") && resolve()));
const base = `http://127.0.0.1:${PORT}`;
const get = async (p, init) => { const r = await fetch(base + p, init); return { status: r.status, text: await r.text() }; };
ok("/health отвечает", (await get("/health")).status === 200);
ok("неизвестный адрес 404", (await get("/api/нет")).status === 404);
ok("/api/status отвечает JSON", JSON.parse((await get("/api/status")).text) !== null);
ok("без токена sync закрыт (401)", (await get("/api/sync", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://app.example" }, body: JSON.stringify({ op: "head" }) })).status === 401);
ok("слишком большой запрос 413", (await get("/api/lead", { method: "POST", headers: { "Content-Type": "application/json" }, body: "x".repeat(3.2 * 1024 * 1024) })).status === 413);
ok("кривой JSON не роняет сервер", (await get("/api/lead", { method: "POST", body: "{не json" })).status < 500 && (await get("/health")).status === 200);
child.kill("SIGTERM");
console.log(process.exitCode ? "ЕСТЬ ОШИБКИ" : "ВСЁ ПРОШЛО");
