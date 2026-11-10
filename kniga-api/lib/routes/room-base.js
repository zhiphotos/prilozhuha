import { bodyOf, cors, json } from "../config.js";
import { pairs, redis, redisConfigured } from "../redis.js";
import { getRoom, isInvited, isOwner, limited } from "../room.js";

const MAX_BASE = 2500000; // знаков JSON

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
  // Помощник сам спрашивает про новую версию (с «since»): таких запросов много, лимит отдельный и большой.
  const polling = body.since !== undefined;
  if (await limited(req, polling ? "room-poll" : "room-base", polling ? 4000 : 60)) return json(res, 429, { error: "Слишком много обращений. Попробуйте завтра." });
  const raw = await redis("GET", `kr:base:${body.room}`);
  if (!raw) return json(res, 404, { error: "Владелец ещё не открыл книгу для правок." });
  const stored = JSON.parse(raw);
  // Сколько присланных этим помощником правок владелец ещё не разобрал: пока они ждут, свежую версию поверх не кладём.
  const who = String(body.who ?? "").slice(0, 60);
  let waiting = 0;
  if (who) {
    const items = Object.values(pairs(await redis("HGETALL", `kr:inbox:${body.room}`))).map((r) => JSON.parse(r));
    waiting = items.filter((i) => i.kind === "changes" && i.from?.name === who).length;
  }
  if (polling && Number(body.since) >= stored.at) return json(res, 200, { ok: true, same: true, at: stored.at, waiting });
  return json(res, 200, { ok: true, ...stored, name: room.name, waiting });
}
