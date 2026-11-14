// Разовый перенос фото облака книг из памяти Redis на диск: MEDIA_DIR=/var/lib/kniga-media node move-media.mjs
import { redis } from "./lib/redis.js";
import { moveToDisk, mediaOnDisk } from "./lib/media-store.js";
if (!mediaOnDisk()) { console.error("Нужен MEDIA_DIR"); process.exit(1); }
const keys = (await redis("KEYS", "kr:syncm:*")) ?? [];
let total = 0;
for (const key of keys) {
  const id = key.slice("kr:syncm:".length);
  try { const n = await moveToDisk(id); total += n; console.log("перенесено", id.slice(0, 14), n); }
  catch (e) { console.error("ОШИБКА", id.slice(0, 14), e.message); }
}
console.log("Готово, фото:", total);
process.exit(0);
