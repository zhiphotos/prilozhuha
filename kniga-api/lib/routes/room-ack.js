import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { getRoom, isOwner, newKey, sha } from "../room.js";

// POST /api/room-ack { room, ownerKey, ids }  – удалить принятое из входящих.
// POST /api/room-ack { room, ownerKey, rotate: true } – выпустить новую ссылку-приглашение (старая перестанет работать).
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 200, { ok: false });
  const { room, ownerKey, ids, rotate } = bodyOf(req);
  const record = await getRoom(room);
  if (!isOwner(record, ownerKey)) return json(res, 404, { error: "Комната не найдена." });
  if (rotate) {
    const inviteKey = newKey(9);
    record.inviteHash = sha(inviteKey);
    await redis("SET", `kr:room:${room}`, JSON.stringify(record));
    return json(res, 200, { ok: true, inviteKey });
  }
  for (const id of Array.isArray(ids) ? ids.slice(0, 100) : []) await redis("HDEL", `kr:inbox:${room}`, String(id));
  return json(res, 200, { ok: true });
}
