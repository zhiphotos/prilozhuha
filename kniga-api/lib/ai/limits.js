// Лимиты ИИ. Значения по умолчанию можно менять без кода: переменная окружения AI_LIMITS (JSON), например
//   {"text":{"per":"day","user":15},"audio_min":{"per":"month","user":600,"global":20000}}
// Единицы: text – запросы, facts – вызовы «найти главное в интервью» (кусок до 9000 знаков = 1), audio_min – минуты аудио, ocr_pages – страницы, archive – поиски по архивам, chat – вопросы ИИ-генеалогу, chapter – художественные главы.
// global – общий потолок на всех покупателей за период. Без global общий потолок не действует, поэтому он задан по умолчанию.
export const DEFAULT_LIMITS = {
  text: { per: "day", user: 20, global: 400 },
  facts: { per: "month", user: 300, global: 8000 },
  audio_min: { per: "month", user: 300, global: 20000 },
  ocr_pages: { per: "month", user: 100, global: 3000 },
  archive: { per: "month", user: 10, global: 1200 }, // около 40 единиц Cloudflare за поиск на малой модели; 1200 в месяц = 40 в сутки
  // Генеалог на бесплатном запасе Cloudflare (около 200 единиц за вопрос на большой модели, всего 10 000 в сутки на всё): 3 вопроса в день на человека, общий потолок 40. При подключении оплаты поднять через AI_LIMITS.
  chat: { per: "day", user: 3, global: 40 },
  // Художественная глава: длинный ответ большой модели (около 300 единиц), поэтому 2 в день на человека и 15 на всех.
  chapter: { per: "day", user: 2, global: 15 },
};

export const KINDS = Object.keys(DEFAULT_LIMITS);

export function limits(env = process.env) {
  let custom = {};
  try {
    custom = JSON.parse(env.AI_LIMITS || "{}");
  } catch {
    custom = {};
  }
  const out = {};
  for (const kind of KINDS) {
    const base = DEFAULT_LIMITS[kind];
    const c = custom[kind] && typeof custom[kind] === "object" ? custom[kind] : {};
    const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
    out[kind] = { per: c.per === "day" || c.per === "month" ? c.per : base.per, user: num(c.user, base.user), global: num(c.global, base.global) };
  }
  return out;
}

/** Аварийный выключатель: ИИ работает только при AI_ENABLED=1. По умолчанию выключен, чтобы ничего не тратилось без решения владельца. */
export const aiEnabled = (env = process.env) => env.AI_ENABLED === "1";
