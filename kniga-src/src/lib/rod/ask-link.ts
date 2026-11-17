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

/** Интервью: подборка вопросов из колоды (номера карточек) или шаблон истории целиком. Вопросы в ссылку не кладутся: у родственника то же приложение, он берёт их из колоды по номерам. */
export type Interview = { kind: "deck" | "tpl" | "custom"; id: string; idx: number[] };

export const MAX_INTERVIEW = 30;

const base = (room: { id: string; inviteKey: string }) => `${window.location.origin}${window.location.pathname}#/join/${room.id}.${room.inviteKey}`;

export function interviewLink(room: { id: string; inviteKey: string }, iv: Interview): string {
  if (iv.kind === "custom") return `${base(room)}?x=${encodeURIComponent(iv.id)}`;
  if (iv.kind === "tpl") return `${base(room)}?t=${encodeURIComponent(iv.id)}`;
  const idx = [...new Set(iv.idx)].filter((n) => Number.isInteger(n) && n >= 0).sort((a, b) => a - b).slice(0, MAX_INTERVIEW);
  return `${base(room)}?d=${encodeURIComponent(iv.id)}&i=${idx.join(".")}`;
}

export function interviewFromHash(hash: string): Interview | null {
  const custom = hash.match(/[?&]x=([0-9a-f]{10})/);
  if (custom) return { kind: "custom", id: custom[1]!, idx: [] };
  const tpl = hash.match(/[?&]t=([\w-]{1,40})/);
  if (tpl) return { kind: "tpl", id: tpl[1]!, idx: [] };
  const deck = hash.match(/[?&]d=([\w-]{1,40})&i=([\d.]{1,200})/);
  if (!deck) return null;
  const idx = deck[2]!.split(".").filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n >= 0).slice(0, MAX_INTERVIEW);
  return idx.length ? { kind: "deck", id: deck[1]!, idx } : null;
}

export const interviewMessage = (title: string, count: number, link: string) =>
  `Привет! Я собираю нашу семейную книгу и придумала для тебя небольшое интервью «${title}»: ${count} ${count === 1 ? "вопрос" : count < 5 ? "вопроса" : "вопросов"}.\n\nОтветь на те, на которые захочешь, по ссылке. Это бесплатно, без регистрации, можно по частям.\n${link}`;
