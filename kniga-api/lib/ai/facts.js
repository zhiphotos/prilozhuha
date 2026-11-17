// Факты из расшифровки интервью. Модель слабая (8B), поэтому ей не доверяем: сервер сам разбирает ответ,
// проверяет каждую цитату по входному тексту и выбрасывает всё, чего в тексте нет.

export const FACT_KINDS = ["people", "places", "events", "dates", "objects", "occupations", "surnames", "traditions", "quotes", "unclear"];
export const CERTAINTY = ["ясно", "неясно", "проверить"];
export const MAX_TEXT = 9000;
const MIN_QUOTE = 8; // короче цитату нельзя проверить честно
const MAX_FACTS = 60;

export const FACTS_SYSTEM = `Ты помощник по семейной истории. Тебе дают кусок расшифровки живого разговора (запись шла на слух, слова могут быть искажены). Твоя работа: вытащить из него ВСЁ интересное для семейной книги, ничего не придумывая.
ЧТО ИСКАТЬ (в порядке важности):
- события и рассказанные истории (events): любой случай, поездка, переезд, свадьба, война, болезнь, праздник, шутка из жизни. title = короткое название, detail = пересказ 1-2 предложения.
- места (places): города, деревни, улицы, дома, дачи, школы, заводы, где жили, бывали, работали.
- занятия и профессии (occupations): кто кем работал, чем увлекался, что умел делать руками (title = что, detail = кто).
- увлечения и таланты (traditions): хобби, песни, рецепты, обычаи, привычки семьи.
- люди (people): имя, кем приходится (relation), годы, место. Фамилии (surnames).
- даты и годы (dates), вещи с историей: альбом, награда, фото (objects), яркие фразы (quotes).
- противоречия и неясные места (unclear).
Бери все такие факты, даже мелкие, если они про жизнь семьи. Пропускай только болтовню без содержания («давай посмотрим», «вот это»).
ПРАВИЛА:
1. ТОЛЬКО то, что сказано в тексте. Нет в тексте: null. Не угадывай.
2. Поле "quote": короткая дословная цитата из текста, 5-12 слов, скопированная без изменений, именно то место, где это сказано.
3. Родство пиши, только если оно прямо сказано. Иначе relation null.
4. Сомнительное (искажённое слово, неясно кто «он») помечай certainty "неясно" и коротко объясняй в "note".
5. Пиши по-русски, коротко. Никаких комментариев вне JSON.
ОТВЕТ: строго один JSON без markdown:
{"facts":[{"kind":"events","title":"Поездка в Тулу","relation":null,"years":null,"place":"Тула","detail":"кратко что было","quote":"дословная цитата","certainty":"ясно","note":null}]}
kind: people, places, events, dates, objects, occupations, surnames, traditions, quotes, unclear. certainty: "ясно" или "неясно". Если ничего нет: {"facts":[]}.`;

/** Сравнение текста без пробельных и регистровых различий. */
export const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
/** Ещё мягче: без знаков препинания и кавычек. */
export const loose = (s) => norm(s).replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();

/** Лишнее по краям цитаты: кавычки, многоточие, пробелы. */
export function cleanQuote(q) {
  return String(q ?? "").replace(/^[\s"'«»“”„‘’…\.\-–]+|[\s"'«»“”„‘’…\.\-–]+$/g, "").replace(/\.{3}|…/g, " ").trim();
}

/** Достать JSON из ответа модели: она любит добавлять слова вокруг и ставить ``` . */
export function parseModelJson(raw) {
  let s = String(raw ?? "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const tryParse = (t) => { try { return JSON.parse(t); } catch { return undefined; } };
  let v = tryParse(s);
  if (v === undefined) {
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) v = tryParse(s.slice(a, b + 1));
  }
  if (v === undefined) {
    // Обрезанный ответ: берём все полностью закрытые объекты фактов.
    const items = [];
    const re = /\{[^{}]*\}/g;
    let m;
    while ((m = re.exec(s))) { const o = tryParse(m[0]); if (o && typeof o === "object" && "quote" in o) items.push(o); }
    if (items.length) v = { facts: items };
  }
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.facts)) return v.facts;
  return null;
}

const str = (v, max) => {
  if (v === null || v === undefined) return "";
  const t = String(v).trim();
  return !t || /^(null|none|нет|неизвестно|не указано)$/i.test(t) ? "" : t.slice(0, max);
};

/** Имя должно встречаться в тексте хотя бы по основе слова (падежи): иначе факт помечается «неясно». */
function nameInText(title, textNorm) {
  const words = loose(title).split(" ").filter((w) => w.length >= 3);
  if (!words.length) return true;
  return words.some((w) => textNorm.includes(w.length > 5 ? w.slice(0, w.length - 2) : w.slice(0, Math.max(3, w.length - 1))));
}

/** Мягкий поиск цитаты: модель часто чуть искажает слова. Ищем окно текста, где есть ≥70% слов цитаты, и берём настоящие слова из текста. */
function fuzzyQuote(quote, text) {
  const qw = loose(quote).split(" ").filter((w) => w.length >= 3).map((w) => w.slice(0, 5));
  if (qw.length < 3) return null;
  const words = String(text).match(/\S+/g) ?? [];
  const stems = words.map((w) => loose(w).slice(0, 5));
  const win = Math.ceil(qw.length * 1.6) + 2;
  let best = 0, bestAt = -1;
  for (let i = 0; i < stems.length; i++) {
    if (!qw.includes(stems[i])) continue;
    const slice = new Set(stems.slice(i, i + win));
    const score = qw.filter((w) => slice.has(w)).length / qw.length;
    if (score > best) { best = score; bestAt = i; }
  }
  if (best < 0.7 || bestAt < 0) return null;
  return words.slice(bestAt, bestAt + Math.min(win, Math.ceil(qw.length * 1.3) + 2)).join(" ");
}

/** Модель часто не пишет цитату. Тогда сервер сам ищет в тексте место, где сказано про этот факт (по словам названия и пересказа), и берёт настоящие слова оттуда. Нет такого места в тексте: факт выдуман, отбрасываем. */
function locateQuote(f, text, kind) {
  const need = loose(str(f.title, 120)).split(" ").filter((w) => w.length >= 3).map((w) => w.slice(0, 5));
  const extra = loose(str(f.detail, 400)).split(" ").filter((w) => w.length >= 5).map((w) => w.slice(0, 5));
  if (!need.length) return null;
  const words = String(text).match(/\S+/g) ?? [];
  const stems = words.map((w) => loose(w).slice(0, 5));
  const win = 28;
  const nameKinds = kind === "people" || kind === "places" || kind === "surnames";
  let best = -1, bestAt = -1;
  for (let i = 0; i < stems.length; i++) {
    if (!need.includes(stems[i])) continue;
    const slice = new Set(stems.slice(Math.max(0, i - 6), i + win));
    const hit = need.filter((w) => slice.has(w)).length;
    if (nameKinds ? hit < need.length && hit < 1 : hit < Math.min(2, need.length)) continue;
    const score = hit * 3 + extra.filter((w) => slice.has(w)).length;
    if (score > best) { best = score; bestAt = i; }
  }
  if (bestAt < 0) return null;
  return words.slice(Math.max(0, bestAt - 6), bestAt + win).join(" ");
}

/** Проверка и очистка фактов. Возвращает { facts, dropped }. */
export function sanitizeFacts(rawFacts, text) {
  const textNorm = norm(text), textLoose = loose(text);
  const facts = [], seen = new Set();
  let dropped = 0;
  for (const f of Array.isArray(rawFacts) ? rawFacts.slice(0, MAX_FACTS * 2) : []) {
    if (!f || typeof f !== "object") { dropped += 1; continue; }
    const kind = FACT_KINDS.includes(f.kind) ? f.kind : null;
    const title = str(f.title, 120);
    const quote = cleanQuote(str(f.quote, 400));
    if (!kind || !title) { dropped += 1; continue; }
    let certainty = CERTAINTY.includes(f.certainty) ? f.certainty : "ясно";
    let note = str(f.note, 240);
    let found = norm(quote).length >= MIN_QUOTE && textNorm.includes(norm(quote));
    if (!found) {
      if (norm(quote).length >= MIN_QUOTE && loose(quote).length >= MIN_QUOTE && textLoose.includes(loose(quote))) {
        found = true;
        if (certainty === "ясно") certainty = "проверить";
        note = note || "Цитата совпала не буква в букву: послушайте момент.";
      }
    }
    let quoteOut = quote;
    if (!found) {
      const fz = (norm(quote).length >= MIN_QUOTE ? fuzzyQuote(quote, text) : null) ?? locateQuote(f, text, kind);
      if (fz) { found = true; quoteOut = fz; if (certainty === "ясно") certainty = "проверить"; note = note || "Слова в записи чуть отличаются: послушайте момент."; }
    }
    if (!found) { dropped += 1; continue; }
    if ((kind === "people" || kind === "places" || kind === "surnames") && !nameInText(title, textLoose)) {
      certainty = "неясно";
      note = note || "Такого слова нет в тексте дословно: возможно, расслышано неточно.";
    }
    if (kind === "unclear" && certainty === "ясно") certainty = "неясно";
    // Родство берём, только если слово родства реально есть в цитате (иначе ИИ его придумал).
    let rel = kind === "people" ? str(f.relation, 120) : "";
    if (rel) {
      const stem = loose(rel).split(" ")[0].slice(0, 4);
      if (stem.length >= 3 && !loose(quote).includes(stem)) rel = "";
    }
    const fact = { kind, title, detail: str(f.detail, 400), relation: rel, years: kind === "people" ? str(f.years, 60) : "", place: kind === "people" ? str(f.place, 120) : "", quote: quoteOut, certainty, note };
    const key = `${kind}|${loose(title)}|${loose(quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
    if (facts.length >= MAX_FACTS) break;
  }
  return { facts, dropped };
}
