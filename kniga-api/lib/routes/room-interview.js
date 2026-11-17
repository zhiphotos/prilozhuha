import { randomBytes } from "node:crypto";
import { bodyOf, cors, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { getRoom, isInvited, isOwner, limited } from "../room.js";

const MAX_QUESTIONS = 40;
const MAX_LEN = 400;
const TTL = 365 * 86400;

const clean = (list) =>
  (Array.isArray(list) ? list : [])
    .map((q) => String(q ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LEN))
    .filter((q) => q.length >= 3)
    .slice(0, MAX_QUESTIONS);

// POST /api/room-interview { room, ownerKey, title, questions[] } → { id }  владелец создаёт собственное интервью для родственника
// POST /api/room-interview { room, invite, id }                  → { title, questions[] }  родственник открывает его по короткой ссылке
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST" || !redisConfigured()) return json(res, 503, { error: "Пока не подключено." });
  const body = bodyOf(req);
  const room = await getRoom(body.room);
  if (body.questions !== undefined) {
    if (!isOwner(room, body.ownerKey)) return json(res, 404, { error: "Комната не найдена." });
    const questions = clean(body.questions);
    if (!questions.length) return json(res, 400, { error: "Впишите хотя бы один вопрос." });
    const id = randomBytes(5).toString("hex");
    await redis("SET", `kr:iv:${body.room}:${id}`, JSON.stringify({ title: String(body.title ?? "").trim().slice(0, 80) || "Интервью", questions }), "EX", TTL);
    return json(res, 200, { ok: true, id });
  }
  if (!isInvited(room, body.invite)) return json(res, 404, { error: "Приглашение не найдено или больше не действует." });
  if (await limited(req, "room-interview", 300)) return json(res, 429, { error: "Слишком много обращений. Попробуйте завтра." });
  const id = String(body.id ?? "");
  if (!/^[0-9a-f]{10}$/.test(id)) return json(res, 404, { error: "Интервью не найдено." });
  const raw = await redis("GET", `kr:iv:${body.room}:${id}`);
  if (!raw) return json(res, 404, { error: "Интервью не найдено или больше не действует." });
  return json(res, 200, { ok: true, ...JSON.parse(raw) });
}
