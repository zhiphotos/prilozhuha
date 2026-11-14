// Фото на диске и перенос из Redis: `node test-media-disk.mjs`
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.MEMORY_STORE = "1";
const redisMod = await import("./lib/redis.js");
const store = await import("./lib/media-store.js");
const ref = "media:0a1b2c3d-4e5f";
let fail = 0;
const ok = (c, m) => { if (!c) { fail += 1; console.error("НЕ ВЫШЛО:", m); } };
// 1. без диска: Redis
ok(!(await store.hasMedia("acc1", ref)), "пусто");
await store.putChunk("acc1", ref, 0, 2, "AAA"); await store.putChunk("acc1", ref, 1, 2, "BBB");
ok(await store.hasMedia("acc1", ref), "есть в Redis");
ok((await store.getChunk("acc1", ref, 1)).data === "BBB", "кусок из Redis");
// 2. с диском: старое читается, новое пишется на диск, перенос чистит Redis
process.env.MEDIA_DIR = mkdtempSync(join(tmpdir(), "media-"));
ok((await store.getChunk("acc1", ref, 0)).data === "AAA", "старое читается с диском");
await store.putChunk("acc2", ref, 0, 1, "ZZZ");
ok((await store.getChunk("acc2", ref, 0)).data === "ZZZ" && (await store.getChunk("acc2", ref, 0)).n === 1, "новое с диска");
ok((await redisMod.redis("HLEN", "kr:syncm:acc2")) === 0, "новое не попало в Redis");
ok((await store.moveToDisk("acc1")) === 1, "перенесено одно фото");
ok((await redisMod.redis("EXISTS", "kr:syncm:acc1")) === 0, "Redis очищен");
ok((await store.getChunk("acc1", ref, 1)).data === "BBB" && (await store.hasMedia("acc1", ref)), "после переноса читается с диска");
ok(readdirSync(process.env.MEDIA_DIR).length === 2, "две папки доступов");
// 3. письмо о нехватке места
const { checkLoad } = await import("./lib/load-alert.js");
process.env.MAIL_FROM = "a@b.ru"; process.env.RESEND_API_KEY = "x";
ok(Array.isArray(await checkLoad(async () => {})), "проверка не падает");
console.log(fail ? `ПРОВАЛ: ${fail}` : "Фото на диске: всё в порядке");
process.exit(fail ? 1 : 0);
