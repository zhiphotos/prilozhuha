import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { getRoom, isInvited, isOwner, limited } from "../room.js";

const MAX_BASE = 900000; // знаков JSON

// POST /api/room-base { room, ownerKey, base }   – владелец выкладывает версию книги для помощников (люди, места, истории, заметки, страницы без фото).
// POST /api/room-base { room, invite }           – помощник забирает эту версию и работает с ней у себя.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 503, { error: "Пока не подключено." });
  const body = bodyOf(req);
  const room = await getRoom(body.room);
  if (body.base !== undefined) {
    if (!isOwner(room, body.ownerKey)) return json(res, 404, { error: "Комната не найдена." });
    const raw = JSON.stringify(body.base ?? {});
    if (raw.length > MAX_BASE) return json(res, 400, { error: "Книга для помощников получилась слишком большой." });
    await redis("SET", `kr:base:${body.room}`, JSON.stringify({ at: Date.now(), base: JSON.parse(raw) }));
    return json(res, 200, { ok: true });
  }
  if (!isInvited(room, body.invite)) return json(res, 404, { error: "Приглашение не найдено или больше не действует." });
  if (await limited(req, "room-base", 60)) return json(res, 429, { error: "Слишком много обращений. Попробуйте завтра." });
  const raw = await redis("GET", `kr:base:${body.room}`);
  if (!raw) return json(res, 404, { error: "Владелец ещё не открыл книгу для правок." });
  return json(res, 200, { ok: true, ...JSON.parse(raw), name: room.name });
}
