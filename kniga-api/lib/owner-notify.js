import { redis } from "./redis.js";
import { mailConfigured, sendMail } from "./mail.js";
import { notifyAdmin } from "./outbox.js";

// Уведомления владельцу о событиях с людьми: оплата, первый успешный вход. Письмо уходит сразу на OWNER_NOTIFY_EMAIL (на телефоне это обычное уведомление почты),
// копия идёт в очередь бота. Сбой уведомления никогда не ломает оплату или вход.
export const mask = (mail) => {
  const [name = "", host = ""] = String(mail ?? "").split("@");
  return host ? `${name.slice(0, 2)}***@${host}` : "без почты";
};
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const dayOf = (ms) => new Date(ms).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Moscow" });

export async function ownerEvent(text, dedupe) {
  try {
    if (dedupe) {
      const first = await redis("SET", `kr:ownerseen:${dedupe}`, "1", "NX");
      if (first !== "OK") return;
    }
    await notifyAdmin(text);
    const to = process.env.OWNER_NOTIFY_EMAIL?.trim();
    if (to && mailConfigured()) await sendMail({ to, subject: text.split("\n")[0].slice(0, 120), text, html: `<p>${esc(text).replace(/\n/g, "<br>")}</p>` });
  } catch (error) {
    console.error("[owner-notify]", error instanceof Error ? error.message : error);
  }
}

export const paymentEvent = ({ email, orderNumber, until }) => ownerEvent(`Новая оплата в Книге рода\nПочта: ${mask(email)}\nЗаказ: ${orderNumber}${until ? `\nДоступ до ${dayOf(until)}` : ""}`, `pay:${orderNumber}`);

/** Первый успешный вход по доступу (оплата или личный код): один раз на доступ, даже если места потом освобождали. */
export async function firstLoginEvent(identity) {
  try {
    let who = "";
    if (String(identity).startsWith("grant-")) {
      const raw = await redis("HGET", "kr:grants", String(identity).slice(6));
      const g = raw ? JSON.parse(raw) : {};
      who = `по коду${g.note ? ` («${g.note}»)` : ""}${g.email ? `, почта ${mask(g.email)}` : ""}`;
    } else {
      const all = (await redis("HGETALL", "kr:paid")) ?? [];
      let email = "";
      for (let i = 0; i + 1 < all.length; i += 2) {
        try { if (JSON.parse(all[i + 1]).order === identity) email = all[i]; } catch { /* битая запись */ }
      }
      who = `по оплате (заказ ${identity}${email ? `, ${mask(email)}` : ""})`;
    }
    await ownerEvent(`Новый человек зашёл в приложение\nПервый вход ${who}`, `login:${identity}`);
  } catch (error) {
    console.error("[owner-notify]", error instanceof Error ? error.message : error);
  }
}
