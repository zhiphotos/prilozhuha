// Отправка писем. Порты SMTP на хостинге закрыты, поэтому основной путь: Resend по HTTPS. Дальше SMTP (если порты откроют), затем Unisender Go. Пароли лежат только в окружении сервера.
import nodemailer from "nodemailer";

const ENDPOINT = "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json";
const endpoint = () => process.env.MAIL_API_URL || ENDPOINT; // в проверках подставляется поддельный сервис

const smtpReady = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);
const resendReady = () => Boolean(process.env.RESEND_API_KEY);
const RESEND_URL = () => process.env.RESEND_API_URL || "https://api.resend.com/emails";
export const mailConfigured = () => Boolean(process.env.MAIL_FROM && (resendReady() || smtpReady() || process.env.UNISENDER_API_KEY));

let transport = null;
const smtp = () =>
  (transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.yandex.ru",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 15_000,
    socketTimeout: 20_000,
  }));

/** Отправить письмо. Бросает ошибку, если его не приняли. */
export async function sendMail({ to, subject, html, text }) {
  if (!mailConfigured()) throw new Error("mail: не настроено");
  const fromName = process.env.MAIL_FROM_NAME || "Книга рода";
  if (resendReady()) {
    const r = await fetch(RESEND_URL(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: `${fromName} <${process.env.MAIL_FROM}>`, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });
    const a = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`mail: resend ${r.status} ${a.message ?? a.name ?? ""}`.trim());
    return;
  }
  if (smtpReady() && !process.env.MAIL_API_URL) {
    await smtp().sendMail({ from: { name: fromName, address: process.env.MAIL_FROM }, to, subject, html, text });
    return;
  }
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": process.env.UNISENDER_API_KEY },
    body: JSON.stringify({
      message: {
        recipients: [{ email: to }],
        subject,
        from_email: process.env.MAIL_FROM,
        from_name: fromName,
        body: { html, plaintext: text },
        skip_unsubscribe: 1,
        track_links: 0,
        track_read: 0,
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok || answer.status === "error") throw new Error(`mail: ${response.status} ${answer.message ?? answer.code ?? ""}`.trim());
}
