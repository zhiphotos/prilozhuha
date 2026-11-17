import { bodyOf, cors, json } from "../config.js";
import { subId } from "../push.js";
import { redis, redisConfigured } from "../redis.js";
import { getRoom, isOwner } from "../room.js";

// POST /api/push-room { endpoint, room, ownerKey }  – владелец книги просит присылать уведомление на это устройство, когда родственник что-то отправит.
// Подтверждаем, что это владелец комнаты (по его ключу), и запоминаем связку «комната → подписка».
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 200, { ok: false });
  const body = bodyOf(req);
  if (typeof body.endpoint !== "string" || !body.room) return json(res, 200, { ok: false });
  if (!isOwner(await getRoom(body.room), body.ownerKey)) return json(res, 404, { error: "Комната не найдена." });
  const id = subId(body.endpoint);
  const exists = await redis("HEXISTS", "kr:push", id);
  if (Number(exists) !== 1) return json(res, 200, { ok: false });
  await redis("HSET", `kr:roompush:${body.room}`, id, String(Date.now()));
  return json(res, 200, { ok: true });
}
