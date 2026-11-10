// Посредник для бота «Дед Привратник». С российского сервера до Telegram не достучаться и обратно тоже,
// поэтому Telegram присылает сообщения сюда (Vercel за границей), а мы без изменений передаём их на сервер Книги Рода
// и в ответ возвращаем то, что он ответил: Telegram сам отправит этот ответ человеку. Здесь нет ни токена бота, ни паролей.
const TARGET = process.env.RU_API_URL || "https://kniga-balanuca.ru/api/tg-bot";

export default async function handler(req, res) {
  res.setHeader("content-type", "application/json");
  if (req.method !== "POST") return res.status(405).send("{}");
  try {
    const answer = await fetch(TARGET, {
      method: "POST",
      headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": String(req.headers["x-telegram-bot-api-secret-token"] || "") },
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(8000),
    });
    return res.status(200).send(await answer.text());
  } catch {
    return res.status(200).send("{}");
  }
}
