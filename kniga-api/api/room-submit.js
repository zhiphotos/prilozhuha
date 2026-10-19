import { bodyOf, cors, json } from "../lib/config.js";
import { redis, redisConfigured } from "../lib/redis.js";
import { getRoom, isInvited, limited, newKey } from "../lib/room.js";

const MAX_TEXT = 6000;
const MAX_PHOTO = 600000; // знаков data-URL, примерно 450 КБ
const clean = (value, max) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);

// POST /api/room-submit { room, invite, from:{name,relation}, kind:"story"|"answer"|"photo", title, question, text, photo }
// Родственник присылает воспоминание, ответ на вопрос или фото. Уроки и книга владельца ему не показываются: приходит только во «Входящие» владельца.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (!redisConfigured()) return json(res, 503, { error: "Пока не подключено." });
  const body = bodyOf(req);
  const room = await getRoom(body.room);
  if (!isInvited(room, body.invite)) return json(res, 404, { error: "Приглашение не найдено или больше не действует." });
  if (await limited(req, "room-submit", 40)) return json(res, 429, { error: "На сегодня достаточно. Продолжите завтра." });
  const kind = ["story", "answer", "photo"].includes(body.kind) ? body.kind : "story";
  const item = {
    id: newKey(9),
    kind,
    at: Date.now(),
    from: { name: clean(body.from?.name, 60) || "Родственник", relation: clean(body.from?.relation, 40) },
    title: clean(body.title, 120),
    question: clean(body.question, 300),
    text: clean(body.text, MAX_TEXT),
  };
  if (body.photo) {
    const photo = String(body.photo);
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > MAX_PHOTO) return json(res, 400, { error: "Фото не подошло: нужно JPEG, PNG или WebP до 450 КБ." });
    item.photo = photo;
  }
  if (!item.text && !item.photo) return json(res, 400, { error: "Напишите хотя бы пару слов или добавьте фото." });
  const key = `kr:inbox:${body.room}`;
  if (Number(await redis("HLEN", key)) >= 200) return json(res, 429, { error: "Входящие переполнены. Попросите владельца книги разобрать их." });
  await redis("HSET", key, item.id, JSON.stringify(item));
  return json(res, 200, { ok: true });
}
