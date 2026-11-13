// Отправка писем через Unisender Go (HTTP API). Ключ и адрес отправителя лежат в окружении сервера, в коде их нет.
const ENDPOINT = "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json";
const endpoint = () => process.env.MAIL_API_URL || ENDPOINT; // в проверках подставляется поддельный сервис

export const mailConfigured = () => Boolean(process.env.UNISENDER_API_KEY && process.env.MAIL_FROM);

/** Отправить письмо. Бросает ошибку, если сервис не принял его. */
export async function sendMail({ to, subject, html, text }) {
  if (!mailConfigured()) throw new Error("mail: не настроено");
  const response = await fetch(endpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": process.env.UNISENDER_API_KEY },
    body: JSON.stringify({
      message: {
        recipients: [{ email: to }],
        subject,
        from_email: process.env.MAIL_FROM,
        from_name: process.env.MAIL_FROM_NAME || "Книга рода",
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
