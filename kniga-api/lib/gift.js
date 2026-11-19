// Подарок «Книга рода»: человек оплачивает доступ для другого, получатель открывает красивую открытку и сам активирует подарок.
// Запись подарка: kr:gift:<номер>. Номер длинный и случайный, он и есть «ключ» ссылки. Доступ получателю выдаётся только после того, как банк подтвердил оплату.
import { randomBytes } from "node:crypto";
import { ACCESS_DAYS } from "./config.js";
import { orderState } from "./alfa.js";
import { redis } from "./redis.js";
import { makeCode } from "./grants.js";
import { mailConfigured, sendMail } from "./mail.js";
import { giftForYouMail, giftMadeMail } from "./mail-templates.js";

export const CARDS = ["ivory", "forest", "rose", "night"];
const PENDING = "kr:giftpending"; // номер заказа в банке -> номер подарка
const DELIVER = "kr:giftdeliver"; // номер подарка -> когда отправить письмо получателю
const GIVE_UP_MS = 3 * 86400000;
const key = (id) => `kr:gift:${id}`;

export const newGiftId = () => randomBytes(15).toString("base64url");
export const validGiftId = (id) => /^[\w-]{20}$/.test(String(id ?? ""));
const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Тексты открытки: имена до 40 знаков, послание до 600. Пустое имя – без имени. */
export function cleanCard(input) {
  const card = CARDS.includes(input?.card) ? input.card : CARDS[0];
  return { from: clean(input?.from, 40), to: clean(input?.to, 40), card, message: String(input?.message ?? "").replace(/\r/g, "").trim().slice(0, 600) };
}

export async function saveGift(id, record) {
  await redis("SET", key(id), JSON.stringify(record));
}

export async function readGift(id) {
  if (!validGiftId(id)) return null;
  const raw = await redis("GET", key(id));
  return raw ? JSON.parse(raw) : null;
}

export async function rememberGiftOrder(orderId, id) {
  await redis("HSET", PENDING, orderId, JSON.stringify({ id, at: Date.now() }));
}

export const giftLink = (rec, id) => `${String(rec.app).split("#")[0]}#/gift/${id}`;

/** Спрашиваем банк: оплачен ли подарок. Оплачен – помечаем и один раз шлём дарителю письмо со ссылкой. Возвращает актуальную запись. */
export async function settleGift(id) {
  const rec = await readGift(id);
  if (!rec || rec.status !== "new") return rec;
  const state = await orderState({ orderId: rec.orderId });
  if (state.refunded) {
    const next = { ...rec, status: "refunded" };
    await saveGift(id, next);
    await redis("HDEL", PENDING, rec.orderId);
    return next;
  }
  if (!state.ok) return rec;
  const next = { ...rec, status: "paid", paidAt: state.paidAt };
  await saveGift(id, next);
  await redis("HDEL", PENDING, rec.orderId);
  if (rec.recipientEmail) await redis("HSET", DELIVER, id, String(rec.deliverAt || Date.now()));
  if (mailConfigured() && (await redis("SET", `kr:giftmailed:${id}`, "1", "NX")) === "OK") {
    try {
      await sendMail({ to: rec.giverEmail, ...giftMadeMail({ to: rec.card.to, link: giftLink(rec, id) }) });
    } catch (error) {
      await redis("DEL", `kr:giftmailed:${id}`);
      console.error("[gift-mail]", error instanceof Error ? error.message : error);
    }
  }
  return next;
}

/** Получатель открыл подарок: выпускаем личный код на год с этого дня. Повторное открытие отдаёт тот же код. Почта получателя (по желанию) включает вход по почте. */
export async function openGift(id, email) {
  const rec = await settleGift(id);
  if (!rec || (rec.status !== "paid" && rec.status !== "opened")) return { error: "not-paid", rec };
  const mail = clean(email, 120).toLowerCase();
  const withMail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) ? mail : "";
  let code = rec.code;
  if (!code) {
    code = makeCode();
    await redis("HSET", "kr:grants", code, JSON.stringify({ at: Date.now(), days: ACCESS_DAYS, note: `gift:${id}`, ...(withMail ? { email: withMail } : {}) }));
    await saveGift(id, { ...rec, status: "opened", code, openedAt: Date.now() });
  } else if (withMail) {
    const raw = await redis("HGET", "kr:grants", code);
    const grant = raw ? JSON.parse(raw) : null;
    if (grant && !grant.email) await redis("HSET", "kr:grants", code, JSON.stringify({ ...grant, email: withMail }));
  }
  return { code };
}

/** Письма получателям: подарки, у которых наступило время отправки. Письмо уходит один раз. */
export async function deliverDue() {
  const flat = (await redis("HGETALL", DELIVER)) ?? [];
  let sent = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const id = flat[i];
    if (Number(flat[i + 1]) > Date.now()) continue;
    const rec = await readGift(id);
    if (!rec || !rec.recipientEmail || (rec.status !== "paid" && rec.status !== "opened")) {
      await redis("HDEL", DELIVER, id);
      continue;
    }
    if (!mailConfigured()) continue;
    if ((await redis("SET", `kr:giftdelivered:${id}`, "1", "NX")) !== "OK") {
      await redis("HDEL", DELIVER, id);
      continue;
    }
    try {
      await sendMail({ to: rec.recipientEmail, ...giftForYouMail({ from: rec.card.from, to: rec.card.to, link: giftLink(rec, id) }) });
      await redis("HDEL", DELIVER, id);
      sent += 1;
    } catch (error) {
      await redis("DEL", `kr:giftdelivered:${id}`); // не ушло: следующая сверка попробует снова
      console.error("[gift-deliver]", id, error instanceof Error ? error.message : error);
    }
  }
  return sent;
}

/** Сверка с банком для брошенных вкладок: подарок находится и без возврата дарителя на сайт. */
export async function reconcileGifts() {
  const flat = (await redis("HGETALL", PENDING)) ?? [];
  let settled = 0;
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const orderId = flat[i];
    const { id, at } = JSON.parse(flat[i + 1]);
    if (Date.now() - Number(at || 0) > GIVE_UP_MS) {
      await redis("HDEL", PENDING, orderId);
      continue;
    }
    try {
      const rec = await settleGift(id);
      if (rec?.status === "paid") settled += 1;
    } catch (error) {
      console.error("[gift-reconcile]", id, error instanceof Error ? error.message : error);
    }
  }
  await deliverDue().catch((error) => console.error("[gift-deliver]", error instanceof Error ? error.message : error));
  return settled;
}
