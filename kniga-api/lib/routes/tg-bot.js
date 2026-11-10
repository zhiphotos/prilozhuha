import { timingSafeEqual } from "node:crypto";
import { bodyOf, json } from "../config.js";
import { redis, redisConfigured } from "../redis.js";
import { issueGrant } from "../grants.js";
import { say, tellAdmin } from "../telegram.js";
import * as ded from "../ded.js";

const EMAIL = /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}/;
const link = () => process.env.TRIBUTE_LINK || "";
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Один ход разговора: что сказать человеку (и что сделать на сервере). Вынесено отдельно, чтобы проверять без Telegram. */
export async function reply(from, textRaw) {
  const text = String(textRaw ?? "").trim();
  const id = String(from.id);
  const raw = await redis("HGET", "kr:tg:paid", id);
  const rec = raw ? JSON.parse(raw) : null;
  const paid = Boolean(rec && !rec.refunded);
  const who = from.username ? `@${from.username}` : `${from.first_name ?? ""} (${id})`;
  const mail = text.match(EMAIL)?.[0];

  if (/^\/(start|help)/.test(text)) {
    if (!paid) return ded.greetStranger(link());
    return rec.code ? ded.reminded(rec.code) : ded.greetPaid();
  }
  if (!paid) {
    if (mail) await tellAdmin(`Кто-то ${who} прислал почту ${mail}, а оплаты Трибьют от него нет. Проверь и выдай вручную, если платил.`);
    return ded.notPaid(link());
  }
  if (rec.code) return ded.reminded(rec.code);
  if (!mail) return text ? ded.badEmail() : ded.askEmail();
  const days = Number(process.env.TRIBUTE_ACCESS_DAYS) || 3650;
  const grant = await issueGrant(mail, `tribute tg ${id}`, days);
  await redis("HSET", "kr:tg:paid", id, JSON.stringify({ ...rec, code: grant.code, email: grant.email, issuedAt: Date.now() }));
  await tellAdmin(`Дед Привратник выдал ключ ${grant.code} на ${grant.email} (${who}).`);
  return ded.issued(grant.code);
}

// POST /api/tg-bot  – вебхук Telegram-бота. Секрет в заголовке X-Telegram-Bot-Api-Secret-Token (TG_WEBHOOK_SECRET).
export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const secret = process.env.TG_WEBHOOK_SECRET || "";
  if (!secret || !same(String(req.headers["x-telegram-bot-api-secret-token"] ?? ""), secret)) return json(res, 401, { error: "no" });
  if (!redisConfigured()) return json(res, 200, { ok: true });
  const message = bodyOf(req).message;
  if (message?.chat?.id && message.from && message.chat.type === "private") {
    try {
      await say(message.chat.id, await reply(message.from, message.text));
    } catch (error) {
      console.error("tg-bot", error);
    }
  }
  return json(res, 200, { ok: true });
}
