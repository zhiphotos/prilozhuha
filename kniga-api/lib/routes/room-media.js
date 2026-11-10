import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { getRoom, isInvited, isOwner, limited } from "../room.js";

const MAX_ONE = 600000; // знаков data-URL, около 450 КБ
const MAX_ITEMS = 400;
const REF = /^media:[0-9a-f-]{36}$/;
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

// POST /api/room-media { room, ownerKey|invite, put: { ref: dataUrl } }  – выложить фото для обмена между владельцем и помощником
// POST /api/room-media { room, ownerKey|invite, get: [ref] }              – забрать фото по ссылкам
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 503, { error: "Пока не подключено." });
  const body = bodyOf(req);
  const room = await getRoom(body.room);
  if (!isOwner(room, body.ownerKey) && !isInvited(room, body.invite)) return json(res, 404, { error: "Комната не найдена." });
  if (await limited(req, "room-media", 3000)) return json(res, 429, { error: "На сегодня достаточно. Продолжите завтра." });
  const key = `kr:media:${body.room}`;
  if (body.put && typeof body.put === "object") {
    const entries = Object.entries(body.put).slice(0, 6);
    for (const [ref, data] of entries) {
      if (!REF.test(ref) || typeof data !== "string" || data.length > MAX_ONE || !IMG.test(data)) return json(res, 400, { error: "Фото не подошло." });
    }
    if (Number(await redis("HLEN", key)) + entries.length > MAX_ITEMS) return json(res, 429, { error: "Слишком много фото для обмена. Часть оставьте на потом." });
    for (const [ref, data] of entries) await redis("HSET", key, ref, data);
    await redis("EXPIRE", key, 60 * 86400);
    return json(res, 200, { ok: true });
  }
  const want = (Array.isArray(body.get) ? body.get : []).filter((r) => REF.test(String(r))).slice(0, 6);
  const media = {};
  for (const ref of want) {
    const data = await redis("HGET", key, ref);
    if (data) media[ref] = data;
  }
  return json(res, 200, { ok: true, media });
}
