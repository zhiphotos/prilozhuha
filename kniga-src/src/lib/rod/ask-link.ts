// Чистые функции для отправки вопроса родственнику (без зависимостей от браузера и хранилища, чтобы проверять тестами).

/** Ссылка, по которой родственник сразу видит этот вопрос и может на него ответить. */
export const questionLink = (room: { id: string; inviteKey: string }, question: string) => `${window.location.origin}${window.location.pathname}#/join/${room.id}.${room.inviteKey}?q=${encodeURIComponent(question.slice(0, 400))}`;

/** Вопрос из адреса приглашения (если есть). */
export function questionFromHash(hash: string): string {
  const match = hash.match(/[?&]q=([^&]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]!).slice(0, 400);
  } catch {
    return "";
  }
}

export const questionMessage = (question: string, link: string) =>
  `Привет! Я собираю нашу семейную книгу и хочу спросить тебя:\n\n«${question}»\n\nОтветь, пожалуйста, по ссылке: это бесплатно, без регистрации, займёт пару минут.\n${link}`;
