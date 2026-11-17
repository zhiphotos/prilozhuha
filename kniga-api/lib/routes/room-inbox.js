import { bodyOf, cors, json } from "../config.js";
import { pairs, redis, redisConfigured } from "../redis.js";
import { getRoom, isOwner } from "../room.js";

// POST /api/room-inbox { room, ownerKey }  – входящее от родственников (только владельцу)
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 200, { items: [] });
  const { room, ownerKey } = bodyOf(req);
  if (!isOwner(await getRoom(room), ownerKey)) return json(res, 404, { error: "Комната не найдена." });
  const items = Object.values(pairs(await redis("HGETALL", `kr:inbox:${room}`))).map((raw) => JSON.parse(raw)).sort((a, b) => a.at - b.at);
  const people = Object.values(pairs(await redis("HGETALL", `kr:roomfrom:${room}`))).map((raw) => JSON.parse(raw)).sort((a, b) => b.last - a.last);
  const stat = pairs(await redis("HGETALL", `kr:roomstat:${room}`));
  return json(res, 200, { items, stats: { people, opens: Number(stat.opens ?? 0) } });
}
