import { PROVIDERS, QuotaError } from "./providers.js";
import { aiEnabled } from "./limits.js";
import { FACTS_SYSTEM, MAX_TEXT, parseModelJson, sanitizeFacts } from "./facts.js";
import { downUntil, firstTime, markDown, reserve } from "./quota.js";
import { searchKnowledge } from "./knowledge.js";

const GENEALOGY = `Ты помощник по семейной истории в приложении «Книга рода». Тебе дают данные семейной книги (контекст) и вопрос.
Правила: отвечай по-русски, простыми тёплыми предложениями. Опирайся ТОЛЬКО на контекст. Различай: «подтверждено в книге» и «предположение». Если данных не хватает, прямо скажи, чего не хватает. Не придумывай людей, даты, места, документы и ссылки. Ничего не меняй в книге: только предлагай, что можно уточнить.`;

/** Задачи, которые клиент может запустить. Подсказки (system) живут на сервере: клиент не может превратить ИИ в бесплатный чат. */
export const TASKS = {
  genealogy_ask: { kind: "text", build: ({ question, context }) => ({ system: GENEALOGY, user: `Контекст:\n${String(context ?? "").slice(0, 12000)}\n\nВопрос: ${String(question ?? "").slice(0, 1000)}` }), valid: (i) => String(i.question ?? "").trim().length >= 3 },
};

/** Выполнить задачу: включён ли ИИ, не остановлен ли провайдер, хватает ли квоты, один ли это запрос. Расход возвращается при сбое. */
export async function runTask({ owner, task, input, requestId, env = process.env, now = Date.now() }) {
  const def = Object.hasOwn(TASKS, task) ? TASKS[task] : null;
  if (!def || !def.valid(input ?? {})) return { status: 400, body: { error: "Некорректный запрос." } };
  if (!aiEnabled(env)) return { status: 503, body: { error: "ИИ пока выключен.", code: "disabled" } };
  const provider = PROVIDERS[def.kind];
  if (!provider || !provider.configured(env)) return { status: 503, body: { error: "Эта функция ещё не подключена.", code: "not_configured" } };
  const down = await downUntil(provider.name);
  if (down) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: down } };
  if (!(await firstTime(owner, requestId))) return { status: 409, body: { error: "Этот запрос уже выполняется.", code: "duplicate" } };
  const got = await reserve(owner, def.kind, 1, now, env);
  if (!got.ok) return { status: 429, body: { error: got.scope === "global" ? "Общий дневной запас ИИ закончился." : "Ваш лимит закончился.", code: `${got.scope}_quota`, resetAt: got.resetAt } };
  try {
    const out = await provider.run(def.build(input), env);
    return { status: 200, body: { text: out.text, left: got.left, resetAt: got.resetAt } };
  } catch (error) {
    await got.release();
    if (error instanceof QuotaError) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: await markDown(provider.name, now) } };
    console.error("[ai]", error instanceof Error ? error.message : error);
    return { status: 502, body: { error: "ИИ сейчас не отвечает. Лимит не потрачен." } };
  }
}

/** Расшифровка одного куска звука. Расход считается в минутах (округление вверх); при сбое возвращается. Клиент режет запись на куски и присылает по одному. */
export async function runTranscribe({ owner, audio, seconds, language, prompt, requestId, env = process.env, now = Date.now() }) {
  const secs = Number(seconds);
  const b64 = String(audio ?? "");
  if (!b64 || b64.length > 3_800_000 || !Number.isFinite(secs) || secs < 1 || secs > 90) return { status: 400, body: { error: "Некорректный кусок записи." } };
  if (!aiEnabled(env)) return { status: 503, body: { error: "ИИ пока выключен.", code: "disabled" } };
  const provider = PROVIDERS.audio_min;
  if (!provider || !provider.configured(env)) return { status: 503, body: { error: "Расшифровка ещё не подключена.", code: "not_configured" } };
  const down = await downUntil(provider.name);
  if (down) return { status: 429, body: { error: "Бесплатная квота расшифровки на сегодня закончилась.", code: "provider_quota", resetAt: down } };
  if (!(await firstTime(owner, requestId))) return { status: 409, body: { error: "Этот кусок уже расшифровывается.", code: "duplicate" } };
  const got = await reserve(owner, "audio_min", Math.ceil(secs / 60), now, env);
  if (!got.ok) return { status: 429, body: { error: got.scope === "global" ? "Общий дневной запас расшифровки закончился." : "Ваш лимит минут закончился.", code: `${got.scope}_quota`, resetAt: got.resetAt } };
  try {
    const out = await provider.run({ audio: b64, language: language === "ru" || language === "en" ? language : "ru", prompt }, env);
    return { status: 200, body: { text: out.text, segments: out.segments, left: got.left, resetAt: got.resetAt } };
  } catch (error) {
    await got.release();
    if (error instanceof QuotaError) return { status: 429, body: { error: "Бесплатная квота расшифровки на сегодня закончилась.", code: "provider_quota", resetAt: await markDown(provider.name, now) } };
    console.error("[ai-transcribe]", error instanceof Error ? error.message : error);
    return { status: 502, body: { error: "Расшифровка сейчас не отвечает. Минуты не потрачены." } };
  }
}

/** Факты из куска расшифровки интервью. Клиент режет текст на куски до 9000 знаков; каждый вызов = 1 единица счётчика «facts» (отдельно от минут расшифровки).
 * Ответ модели не принимается на веру: JSON разбирается здесь, каждая цитата сверяется с входным текстом, выдумки выбрасываются. */
export async function runFacts({ owner, text, context, requestId, env = process.env, now = Date.now() }) {
  const input = String(text ?? "").trim();
  if (input.length < 40 || input.length > MAX_TEXT + 500) return { status: 400, body: { error: "Некорректный кусок текста." } };
  if (!aiEnabled(env)) return { status: 503, body: { error: "ИИ пока выключен.", code: "disabled" } };
  const provider = PROVIDERS.facts;
  if (!provider || !provider.configured(env)) return { status: 503, body: { error: "Поиск главного в интервью ещё не подключён.", code: "not_configured" } };
  const down = await downUntil(provider.name);
  if (down) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: down } };
  if (!(await firstTime(owner, requestId))) return { status: 409, body: { error: "Этот кусок уже разбирается.", code: "duplicate" } };
  const got = await reserve(owner, "facts", 1, now, env);
  if (!got.ok) return { status: 429, body: { error: got.scope === "global" ? "Общий дневной запас ИИ закончился." : "Ваш лимит поиска по интервью закончился.", code: `${got.scope}_quota`, resetAt: got.resetAt } };
  try {
    let parsed = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      const out = await provider.run({ system: FACTS_SYSTEM, user: `${context ? `О записи (от пользователя): ${String(context).slice(0, 400)}\n` : ""}Расшифровка:\n"""\n${input}\n"""\nВыпиши факты строго JSON.`, maxTokens: 2400 }, env);
      parsed = parseModelJson(out.text);
    }
    if (!parsed) {
      await got.release();
      return { status: 502, body: { error: "ИИ ответил непонятно. Попробуйте ещё раз: лимит не потрачен.", code: "bad_json" } };
    }
    const { facts, dropped } = sanitizeFacts(parsed, input);
    return { status: 200, body: { facts, dropped, left: got.left, resetAt: got.resetAt } };
  } catch (error) {
    await got.release();
    if (error instanceof QuotaError) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: await markDown(provider.name, now) } };
    console.error("[ai-facts]", error instanceof Error ? error.message : error);
    return { status: 502, body: { error: "ИИ сейчас не отвечает. Лимит не потрачен." } };
  }
}

export const GENEALOGIST_SYSTEM = `Ты опытный генеалог и историк-исследователь, специализирующийся на поиске предков на территории Российской империи, СССР, России, Молдовы и других стран мира. Ты помогаешь пользователям восстанавливать историю семьи, искать архивные источники, расшифровывать старые документы и строить родословные деревья. Отвечай на языке пользователя (русский, румынский/молдавский, английский и др.). Тон тёплый, терпеливый, профессиональный.
Умеешь: объяснять работу архивов России (РГАДА, ГАРФ, региональные) и Молдовы, составлять архивные запросы, объяснять работу сайтов Ancestry, FamilySearch, MyHeritage и др., объяснять исторические административные границы, помогать структурировать данные и строить текстовые схемы дерева, объяснять GEDCOM и стандарты нумерации, расшифровывать дореволюционные документы, переводить старые тексты, объяснять старые термины.
Если человек просит написать текст, главу или рассказ о предке, помоги: уточни, какой нужен стиль (тёплый семейный, классический, от первого лица, документальный очерк, сказ), и предложи прислать готовый рассказ в папку «Глава» на вкладке «ИИ»: там глава пишется целиком. В чате можно набросать короткий фрагмент. Не выдумывай фактов о предках: только то, что человек рассказал.
Правила: в первую очередь опирайся на «Материалы базы знаний», если они даны, и в конце ответа в строке «Источник:» назови, какие использованы (название и раздел). Если в материалах ответа нет, прямо скажи: «Это из общих знаний, проверьте по документам». Ничего не выдумывай: имена, даты, номера фондов и ссылки без уверенности не называй. При недостатке данных сначала уточни регион, период, вероисповедание и известные факты. Структурируй ответ заголовками и шагами. Если пользователь описывает фото или текст документа, помоги прочитать имена, даты, места. Не давай юридических консультаций по наследству и гражданству.`;

const clean = (messages) => {
  if (!Array.isArray(messages)) return null;
  const out = messages.slice(-12).map((m) => ({ role: m?.role === "assistant" ? "assistant" : "user", text: String(m?.text ?? "").trim().slice(0, 2000) })).filter((m) => m.text);
  return out.length && out[out.length - 1].role === "user" ? out : null;
};

/** Один ход чата с ИИ-генеалогом: база знаний + инструкция на сервере. Расход 1 единица «chat», возвращается при сбое. */
export async function runChat({ owner, messages, requestId, env = process.env, now = Date.now() }) {
  const history = clean(messages);
  if (!history) return { status: 400, body: { error: "Напишите вопрос." } };
  if (!aiEnabled(env)) return { status: 503, body: { error: "ИИ пока выключен.", code: "disabled" } };
  const provider = PROVIDERS.chat;
  if (!provider || !provider.configured(env)) return { status: 503, body: { error: "Генеалог ещё не подключён.", code: "not_configured" } };
  const down = await downUntil(provider.name);
  if (down) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: down } };
  if (!(await firstTime(owner, requestId))) return { status: 409, body: { error: "Этот вопрос уже обрабатывается.", code: "duplicate" } };
  const got = await reserve(owner, "chat", 1, now, env);
  if (!got.ok) return { status: 429, body: { error: got.scope === "global" ? "Общий дневной запас ИИ закончился." : "На сегодня ваши вопросы генеалогу закончились, завтра будут новые.", code: `${got.scope}_quota`, resetAt: got.resetAt } };
  try {
    const last = history[history.length - 1].text;
    const { context, sources } = searchKnowledge(history.slice(-3).map((m) => m.text).join(" "));
    const system = context ? `${GENEALOGIST_SYSTEM}\n\nМатериалы базы знаний:\n${context}` : GENEALOGIST_SYSTEM;
    const out = await provider.run({ system, messages: history, maxTokens: 1500 }, env);
    if (!out.text) {
      await got.release();
      return { status: 502, body: { error: "ИИ не ответил. Попробуйте ещё раз: запрос не потрачен." } };
    }
    void last;
    return { status: 200, body: { reply: out.text, sources, left: got.left, resetAt: got.resetAt } };
  } catch (error) {
    await got.release();
    if (error instanceof QuotaError) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: await markDown(provider.name, now) } };
    console.error("[ai-chat]", error instanceof Error ? error.message : error);
    return { status: 502, body: { error: "ИИ сейчас не отвечает. Запрос не потрачен." } };
  }
}

const SEEK_SYSTEM = `Ты исследователь родословной по методике поиска родства на территории бывшего СССР. Тебе дают данные человека, которого ищут, список архивов приложения и материалы базы знаний.
Верни ТОЛЬКО JSON: {"summary":"","leads":[{"href":"","query":"","why":""}],"tips":[""]}
Правила:
- Ничего не выдумывай: ни родственников, ни даты, ни номера дел. Если данных мало, так и скажи.
- href копируй дословно только из списка архивов. Не больше шести, самые уместные для этого места и этого периода первыми.
- query: точная строка для поиска в этом архиве, с учётом вариантов написания имени.
- why: одно предложение, что именно там можно найти и что должно совпасть кроме фамилии (отчество, возраст, место, имена родителей).
- summary: два предложения простым тёплым языком: куда идти первым и почему.
- tips: от двух до четырёх коротких советов, как проверить, что нашёлся тот же человек, какие варианты написания перепробовать, что запросить в архиве. Опирайся на материалы базы знаний. Без ссылок.
- Пиши по-русски, без длинного тире.`;

const cut = (v, n) => String(v ?? "").slice(0, n);
const parseObject = (raw) => {
  let s = String(raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const body = s.slice(a);
  // Модель иногда забывает закрыть скобки в конце: пробуем дописать недостающее.
  for (const tail of ["", "}", "]}", "}]}"]) {
    try { return JSON.parse((tail ? body.replace(/[\s,]*$/, "") : s.slice(a, b + 1)) + tail); } catch { /* пробуем дальше */ }
  }
  return null;
};

/** Поиск по архивам с ИИ: выбирает и расставляет архивы из списка приложения, добавляет советы по методике. Расход 1 единица «archive», возвращается при сбое. */
export async function runSeek({ owner, input, requestId, env = process.env, now = Date.now() }) {
  const leads = Array.isArray(input?.leads) ? input.leads.slice(0, 14) : [];
  if (!leads.length) return { status: 400, body: { error: "Нет списка архивов." } };
  if (!aiEnabled(env)) return { status: 503, body: { error: "ИИ пока выключен.", code: "disabled" } };
  const provider = PROVIDERS.archive;
  if (!provider || !provider.configured(env)) return { status: 503, body: { error: "ИИ в поиске пока не подключён.", code: "not_configured" } };
  const down = await downUntil(provider.name);
  if (down) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: down } };
  if (!(await firstTime(owner, requestId))) return { status: 409, body: { error: "Этот поиск уже выполняется.", code: "duplicate" } };
  const got = await reserve(owner, "archive", 1, now, env);
  if (!got.ok) return { status: 429, body: { error: got.scope === "global" ? "Общий запас ИИ на сегодня закончился." : "В этом месяце все поиски с ИИ уже использованы.", code: `${got.scope}_quota`, resetAt: got.resetAt } };
  try {
    const allowed = new Map(leads.map((l) => [String(l.href), l]));
    const variants = (Array.isArray(input.variants) ? input.variants : []).slice(0, 6).map((v) => cut(v, 80)).join("; ");
    const { context, sources } = searchKnowledge(`${cut(input.question, 300)} ${cut(input.place, 120)} ${cut(input.seek, 40)}`, 4);
    const list = leads.map((l) => `${cut(l.title, 100)} | ${cut(l.href, 300)} | ${cut(l.why, 160)}`).join("\n");
    const user = `Кого ищем: ${cut(input.question, 400)}\nВарианты имени: ${variants || "нет"}\nМесто: ${cut(input.place, 160) || "не указано"}\n\nСписок архивов (title | href | why):\n${list}${context ? `\n\nМатериалы базы знаний:\n${context}` : ""}`;
    const out = await provider.run({ system: SEEK_SYSTEM, user, maxTokens: 900 }, env);
    const parsed = parseObject(out.text);
    const picked = (Array.isArray(parsed?.leads) ? parsed.leads : []).slice(0, 6).flatMap((lead, i) => {
      const src = allowed.get(String(lead?.href ?? ""));
      if (!src) return [];
      return [{ id: `ai-${i}`, title: cut(src.title, 140), archive: cut(src.archive || src.title, 140), href: String(src.href), query: cut(lead.query || src.query, 180), why: cut(lead.why || src.why, 400), grade: ["A", "B", "C"].includes(src.grade) ? src.grade : "B", seen: false }];
    });
    if (!picked.length) {
      await got.release();
      return { status: 502, body: { error: "ИИ не смог подобрать архивы. Поиск не потрачен." } };
    }
    const tips = (Array.isArray(parsed?.tips) ? parsed.tips : []).map((t) => cut(t, 300)).filter(Boolean).slice(0, 4);
    return { status: 200, body: { summary: cut(parsed?.summary, 700), leads: picked, tips, sources, left: got.left, resetAt: got.resetAt } };
  } catch (error) {
    await got.release();
    if (error instanceof QuotaError) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: await markDown(provider.name, now) } };
    console.error("[ai-seek]", error instanceof Error ? error.message : error);
    return { status: 502, body: { error: "ИИ сейчас не отвечает. Поиск не потрачен." } };
  }
}

/** Стили художественной главы. Ключи видит и приложение; сами подсказки живут только здесь. */
export const CHAPTER_STYLES = {
  family: "Тёплый семейный рассказ: так рассказывают за столом, простые живые предложения, немного юмора, конкретные вещи, запахи, звуки.",
  classic: "Классическая русская проза в духе Чехова и Бунина: сдержанно, точные детали, спокойный ритм, без пафоса.",
  memoir: "Воспоминание от первого лица: рассказчик говорит «я», вспоминает и делится личным, без выдумывания того, чего не знает.",
  essay: "Документальный очерк: ясно, по порядку, с датами и местами из текста, лёгкие описания, как в хорошем журнале.",
  skaz: "Сказ: народная интонация, неторопливая речь, присказки и сравнения, но без насмешки и без искажения слов.",
  stories: "Мини-рассказы по записи интервью: каждый про один конкретный эпизод.",
  interview: "Глава по интервью: связный рассказ по темам с живыми деталями, прямыми цитатами рассказчика и ссылками на фрагменты.",
};

// Глава по интервью собирается из нумерованных фрагментов (карточки фактов с цитатами). Формат, который хочет владелец: тематические подзаголовки, живой пересказ, ссылки [n], вопросы в конце.
const INTERVIEW_RULES = `Текст приходит как нумерованные фрагменты записи: [1], [2], … Это единственный источник фактов.
Собери из них главу книги так:
- Первая строка: «Глава: » и название по главному смыслу. Дальше короткое вступление в два-три предложения: чья это история и какие линии в ней есть.
- Дальше блоки по темам, у каждого свой подзаголовок в двойных звёздочках: **Так**. Темы выбирай по материалу, например: корни и места, родители, братья и сёстры, знакомство и свадьба, дети, работа, увлечения и привычки, дом и быт, трудные годы, традиции.
- В блоках живой рассказ связными абзацами, с конкретными деталями из фрагментов. Имена людей, места, даты, числа выделяй **жирным**. Годы жизни пиши в скобках, если они есть во фрагментах.
- Прямые слова рассказчика оставляй цитатами в «ёлочках».
- После каждого утверждения ставь номера фрагментов в квадратных скобках: [3] или [2, 5]. Не ставь номер, которого нет в списке.
- Братьев, сестёр и родню, если их несколько, перечисли списком: «- **Имя** – что известно».
- Если во фрагментах есть разлад или молчание в семье, отдельный блок «Кто с кем общается», без оценок.
- Называй людей так, как их называют во фрагментах и в подсказке автора: «бабушка Валя», «дедушка Саша», «папа Миша». Если автор написал, кем ему приходится рассказчик, держи эту точку зрения: дедушка Саша это муж бабушки Вали, а не её дедушка. Не переворачивай родство.
- Не путай год рождения с годом смерти: пиши «умер в 1981 году» или «родился в…» только если фрагмент так прямо говорит. Если неясно, пиши просто год события.
- Не начинай с «мы узнаем», «эта история рассказывает». Вступление говорит прямо о людях и месте.
- Не смешивай людей с одинаковыми именами и не придумывай связей.
- В конце блок «**Что стоит уточнить**» с вопросами (три – шесть): чего не хватает, например имена родителей, фамилии, годы, места. Вопросы только по пробелам в материале.
- Объём по материалу: от 500 до 1200 слов.`;

// Мини-рассказы по куску записи: не пересказ «о чём разговор», а конкретные эпизоды с героями, местом и временем. Кусок приходит с отметками [мм:сс].
const STORIES_SYSTEM = `Ты писатель семейных хроник. Тебе дали кусок расшифровки интервью с отметками времени [мм:сс] в начале реплик. Напиши из него от двух до четырёх мини-рассказов, каждый про ОДИН конкретный эпизод: что случилось, кто участвовал, где и когда, что говорили и чувствовали.
Правила:
- Это рассказ, а не пересказ темы. Нельзя писать «рассказывает о», «затрагиваются темы», «семья пережила много событий». Пиши сцену: кто, где, что сделал, что сказал.
- Факты только из куска: имена, места, даты, родство и события не придумывай и не меняй. Если чего-то не хватает, не заполняй, лучше короче. Можно осторожно оживлять обстановкой, но без новых имён, дат и событий.
- Слова рассказчика, яркие выражения и прозвища сохраняй, прямую речь давай в «ёлочках».
- Называй людей как в записи и в подсказке автора («бабушка Валя», «дядя Толя»). Не путай людей с одинаковыми именами. Не путай год рождения с годом смерти.
- Один рассказ 120–260 слов, простые тёплые предложения литературного русского, без афоризмов-слоганов и пар «не X, а Y», без длинного тире.
- Реплики об одном и том же случае объединяй в ОДИН рассказ, даже если они идут не подряд. Не дроби случай на куски и не делай отдельный рассказ из одной фразы. Рассказ собирай из начала, середины и конца случая, в порядке событий.
- Выбирай самые живые и содержательные эпизоды, где есть люди и действие. Скучные места и обрывки пропускай.
Ответ только JSON, без пояснений: {"stories":[{"title":"название рассказа (3–7 слов)","text":"текст рассказа абзацами, абзацы разделяй \\n\\n","at":"мм:сс отметка, где эпизод начинается (если отметок нет, пустая строка)","people":[{"name":"как называют в записи","relation":"кем приходится рассказчику или кому, если сказано, иначе пустая строка"}],"places":["места из эпизода"]}]}`;

const toSeconds = (v) => { const m = String(v ?? "").match(/(\d{1,3}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : undefined; };

const CHAPTER_SYSTEM = `Ты писатель семейных хроник. Пользователь присылает рассказ о своей семье (факты, воспоминания, расшифровку записи). Ты превращаешь его в главу книги.
Правила:
- Факты только из присланного текста: имена, даты, места, родство, события не придумывай и не меняй. Если чего-то не хватает, не заполняй пробел выдумкой.
- Можно осторожно оживлять сцену обстановкой, погодой, мелочами быта, но так, чтобы это не выглядело новым фактом (без новых имён, дат, событий). Если не уверен, опусти.
- Сохраняй слова и выражения героев, если они есть в тексте.
- Ни одного афоризма-слогана и рубленых пар вроде «Не X, а Y». Простые тёплые предложения литературного русского.
- Без длинного тире, только короткое «–».
- Первая строка: название главы. Дальше связный текст без списков, 400–700 слов, если материала хватает; иначе короче (для главы по интервью действуют правила ниже).
- В самом конце одной строкой начни с «Заметка:» и перечисли, чего не хватило в тексте и что стоит уточнить у родных (не больше трёх пунктов).
Пиши по-русски.`;

/** Художественная глава по присланному рассказу. Расход 1 единица «chapter», возвращается при сбое. */
export async function runChapter({ owner, input, requestId, env = process.env, now = Date.now() }) {
  const isInterview = input?.style === "interview";
  const isStories = input?.style === "stories";
  const text = cut(input?.text, isStories ? 12500 : isInterview ? 14000 : 6000).trim();
  const style = Object.hasOwn(CHAPTER_STYLES, input?.style) ? input.style : null;
  if (text.length < 120 || !style) return { status: 400, body: { error: text.length < 120 ? "Пришлите рассказ подлиннее: хотя бы несколько предложений." : "Выберите стиль." } };
  if (!aiEnabled(env)) return { status: 503, body: { error: "ИИ пока выключен.", code: "disabled" } };
  const provider = PROVIDERS.chapter;
  if (!provider || !provider.configured(env)) return { status: 503, body: { error: "Эта функция ещё не подключена.", code: "not_configured" } };
  const down = await downUntil(provider.name);
  if (down) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: down } };
  if (!(await firstTime(owner, requestId))) return { status: 409, body: { error: "Эта глава уже пишется.", code: "duplicate" } };
  const got = await reserve(owner, "chapter", isInterview ? 2 : 1, now, env);
  if (!got.ok) return { status: 429, body: { error: got.scope === "global" ? "Общий дневной запас ИИ закончился." : "На сегодня ваши главы закончились, завтра будут новые.", code: `${got.scope}_quota`, resetAt: got.resetAt } };
  try {
    const wish = cut(input?.wish, 300).trim();
    const user = `Стиль: ${CHAPTER_STYLES[style]}${wish ? `\nПодсказка автора (кто рассказывает, кем ему приходятся герои, пожелания): ${wish}` : ""}\n\nРассказ:\n${text}`;
    if (isStories) {
      const outS = await provider.run({ system: STORIES_SYSTEM, messages: [{ role: "user", text: `${wish ? `Подсказка автора (кто рассказывает, кем ему приходятся герои): ${wish}\n\n` : ""}Кусок расшифровки:\n${text}` }], maxTokens: 3200 }, env);
      const parsed = parseObject(outS.text);
      const list = (Array.isArray(parsed?.stories) ? parsed.stories : []).slice(0, 5).map((x) => ({
        title: cut(x?.title, 90).trim(), text: cut(x?.text, 3000).trim(), at: toSeconds(x?.at),
        people: (Array.isArray(x?.people) ? x.people : []).slice(0, 12).map((p) => ({ name: cut(p?.name, 60).trim(), relation: cut(p?.relation, 80).trim() })).filter((p) => p.name),
        places: (Array.isArray(x?.places) ? x.places : []).slice(0, 8).map((p) => cut(p, 60).trim()).filter(Boolean),
      })).filter((x) => x.title && x.text.length > 80);
      if (!list.length) {
        await got.release();
        return { status: 502, body: { error: "ИИ не смог собрать рассказы из этого куска. Попробуйте ещё раз: глава не потрачена." } };
      }
      return { status: 200, body: { stories: list, left: got.left, resetAt: got.resetAt } };
    }
    const system = isInterview ? `${CHAPTER_SYSTEM}\n\n${INTERVIEW_RULES}` : CHAPTER_SYSTEM;
    const out = await provider.run({ system, messages: [{ role: "user", text: user }], maxTokens: isInterview ? 3000 : 1800 }, env);
    if (!out.text) {
      await got.release();
      return { status: 502, body: { error: "ИИ не ответил. Попробуйте ещё раз: глава не потрачена." } };
    }
    return { status: 200, body: { chapter: out.text, left: got.left, resetAt: got.resetAt } };
  } catch (error) {
    await got.release();
    if (error instanceof QuotaError) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: await markDown(provider.name, now) } };
    console.error("[ai-chapter]", error instanceof Error ? error.message : error);
    return { status: 502, body: { error: "ИИ сейчас не отвечает. Глава не потрачена." } };
  }
}
