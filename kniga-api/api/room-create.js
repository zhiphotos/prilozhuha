import { bodyOf, cors, json } from "../lib/config.js";
import { redis, redisConfigured } from "../lib/redis.js";
import { newKey, newRoomId, limited, sha } from "../lib/room.js";
import { readToken } from "../lib/token.js";

// POST /api/room-create { name, token }  – создать общую комнату семьи. Пока оплата не подключена, доступна всем; потом REQUIRE_PAID=1 включает проверку платного токена.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "Семейный доступ ещё не подключён." });
  const { name, token } = bodyOf(req);
  if (process.env.REQUIRE_PAID === "1") {
    const data = readToken(String(token ?? ""));
    if (!data || Date.now() > data.until) return json(res, 402, { error: "Семейный доступ входит в программу. Откройте её на вкладке «Уроки»." });
  }
  if (await limited(req, "room-create", 10)) return json(res, 429, { error: "Слишком много попыток. Попробуйте завтра." });
  const room = newRoomId();
  const ownerKey = newKey(18);
  const inviteKey = newKey(9);
  const record = { ownerHash: sha(ownerKey), inviteHash: sha(inviteKey), name: String(name ?? "").trim().slice(0, 60) || "Семья", created: Date.now() };
  await redis("SET", `kr:room:${room}`, JSON.stringify(record));
  return json(res, 200, { room, ownerKey, inviteKey });
}
