// Факты из расшифровки интервью. Модель слабая (8B), поэтому ей не доверяем: сервер сам разбирает ответ,
// проверяет каждую цитату по входному тексту и выбрасывает всё, чего в тексте нет.

export const FACT_KINDS = ["people", "places", "events", "dates", "objects", "occupations", "surnames", "traditions", "quotes", "unclear"];
export const CERTAINTY = ["ясно", "неясно", "проверить"];
export const MAX_TEXT = 9000;
const MIN_QUOTE = 8; // короче цитату нельзя проверить честно
const MAX_FACTS = 60;

export const FACTS_SYSTEM = `Ты помощник по семейной истории. Тебе дают кусок расшифровки интервью. Твоя работа: выписать из него факты, ничего не придумывая.
ЖЁСТКИЕ ПРАВИЛА:
1. Используй ТОЛЬКО то, что сказано в тексте. Если чего-то нет, пиши null. Не угадывай.
2. У каждого факта поле "quote": ДОСЛОВНАЯ цитата из текста (5-25 слов), скопированная без изменений. Нет цитаты — нет факта.
3. Не угадывай родство. Родство пиши только если оно прямо сказано («моя бабушка Анна»). Если сказано «он», «она», «тот», а кто, непонятно, ставь certainty "неясно".
4. Не объединяй разных людей с одинаковым именем: каждому свой факт.
5. Если имя расслышано странно, год сомнительный или есть два варианта, ставь certainty "неясно" и коротко объясни в "note".
6. Пиши по-русски, коротко. Никаких комментариев вне JSON.
ОТВЕТ: строго один JSON без пояснений и без markdown:
{"facts":[{"kind":"people","title":"Анна","relation":"бабушка рассказчика","years":"1920-1998","place":"Тула","detail":null,"quote":"дословная цитата","certainty":"ясно","note":null}]}
kind бывает: people (люди: title=имя; relation, years, place если сказаны), places (места: города, деревни, адреса, дома), events (события и истории: title=название, detail=краткий пересказ), dates (даты и годы: title=дата, detail=что тогда было), objects (предметы и вещи), occupations (профессии и занятия: detail=кто этим занимался), surnames (фамилии и их варианты), traditions (традиции, обычаи, рецепты), quotes (яркие фразы-цитаты), unclear (противоречия и неясности: detail=что непонятно).
certainty бывает: "ясно" или "неясно". Если в тексте нет ничего из этого, верни {"facts":[]}.`;

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
    if (!kind || !title || norm(quote).length < MIN_QUOTE) { dropped += 1; continue; }
    let certainty = CERTAINTY.includes(f.certainty) ? f.certainty : "ясно";
    let note = str(f.note, 240);
    let found = textNorm.includes(norm(quote));
    if (!found) {
      if (loose(quote).length >= MIN_QUOTE && textLoose.includes(loose(quote))) {
        found = true;
        if (certainty === "ясно") certainty = "проверить";
        note = note || "Цитата совпала не буква в букву: послушайте момент.";
      }
    }
    if (!found) { dropped += 1; continue; }
    if ((kind === "people" || kind === "places" || kind === "surnames") && !nameInText(title, textLoose)) {
      certainty = "неясно";
      note = note || "Такого слова нет в тексте дословно: возможно, расслышано неточно.";
    }
    if (kind === "unclear" && certainty === "ясно") certainty = "неясно";
    const fact = { kind, title, detail: str(f.detail, 400), relation: kind === "people" ? str(f.relation, 120) : "", years: kind === "people" ? str(f.years, 60) : "", place: kind === "people" ? str(f.place, 120) : "", quote, certainty, note };
    const key = `${kind}|${loose(title)}|${loose(quote)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
    if (facts.length >= MAX_FACTS) break;
  }
  return { facts, dropped };
}
