import { bodyOf, cors, json } from "../lib/config.js";
import { redisConfigured } from "../lib/redis.js";
import { getRoom, isInvited } from "../lib/room.js";

// POST /api/room-info { room, invite }  – кто приглашает (для страницы приглашения)
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 200, { ok: false });
  const { room, invite } = bodyOf(req);
  const record = await getRoom(room);
  if (!isInvited(record, invite)) return json(res, 404, { ok: false, error: "Приглашение не найдено или больше не действует." });
  return json(res, 200, { ok: true, name: record.name });
}
