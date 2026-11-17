// Факты из интервью: нарезка текста на куски, проверка цитат, слияние без дублей, привязка к времени в записи.
// Ничего не придумываем: факт без цитаты, найденной в тексте, отбрасывается.
import { plural } from "@/lib/rod/progress";
import type { FactKind, Interview, InterviewFact } from "@/lib/rod/types";
import type { AiResult, RawFact } from "@/lib/rod/ai-client";

export const CHUNK_MAX = 3200;
export const CHUNK_OVERLAP = 500;

export const KIND_ORDER: FactKind[] = ["people", "places", "dates", "events", "objects", "occupations", "surnames", "traditions", "quotes", "unclear"];
export const KIND_TITLE: Record<FactKind, string> = {
  people: "Люди",
  places: "Места",
  dates: "Даты и годы",
  events: "События и истории",
  objects: "Предметы и вещи",
  occupations: "Профессии и занятия",
  surnames: "Фамилии",
  traditions: "Традиции и рецепты",
  quotes: "Фразы и цитаты",
  unclear: "Что неясно",
};

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
export const loose = (s: string) => norm(s).replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();

/** Строки вида «[12:40] слова» → «слова» (отметки времени не часть рассказа). */
export const stripMarks = (text: string) => text.replace(/^\[\d+(?::\d{2}){1,2}\]\s?/gm, "");

/** Режет текст на куски до `max` знаков по границам предложений; соседние куски перекрываются на `overlap` знаков, чтобы факт на стыке не потерялся. */
export function chunkText(text: string, max = CHUNK_MAX, overlap = CHUNK_OVERLAP): string[] {
  const clean = text.replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const pieces: string[] = [];
  for (const para of clean.split(/\n+/)) {
    for (const sentence of para.split(/(?<=[.!?…])\s+/)) {
      let rest = sentence;
      while (rest.length > max) {
        const cut = rest.lastIndexOf(" ", max);
        const at = cut > max / 2 ? cut : max;
        pieces.push(rest.slice(0, at));
        rest = rest.slice(at).trimStart();
      }
      if (rest) pieces.push(rest);
    }
  }
  const chunks: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const piece of pieces) {
    if (len + piece.length + 1 > max && cur.length) {
      chunks.push(cur.join(" "));
      // хвост предыдущего куска (не больше overlap) переходит в следующий
      const tail: string[] = [];
      let tl = 0;
      for (let i = cur.length - 1; i >= 0 && tl + cur[i]!.length <= overlap; i -= 1) {
        tail.unshift(cur[i]!);
        tl += cur[i]!.length + 1;
      }
      cur = tail;
      len = tl;
    }
    cur.push(piece);
    len += piece.length + 1;
  }
  if (cur.length) chunks.push(cur.join(" "));
  return chunks;
}

/** Есть ли цитата в тексте (пробелы и регистр не важны). "exact" – дословно, "loose" – без знаков препинания, null – нет. */
export function findQuote(text: string, quote: string): "exact" | "loose" | null {
  const q = norm(quote);
  if (q.length < 8) return null;
  if (norm(text).includes(q)) return "exact";
  const l = loose(quote);
  return l.length >= 8 && loose(text).includes(l) ? "loose" : null;
}

type Seg = { start: number; end: number; text: string };

/** Секунда в записи, где прозвучала цитата: начало сегмента, в котором она начинается. undefined, если тайм-кодов нет или цитата не найдена. */
export function locateQuote(segments: Seg[], quote: string): number | undefined {
  if (!segments.length) return undefined;
  for (const fn of [norm, loose]) {
    const q = fn(quote);
    if (q.length < 8) continue;
    let joined = "";
    const starts: { at: number; sec: number }[] = [];
    for (const seg of segments) {
      starts.push({ at: joined.length, sec: seg.start });
      joined += `${fn(seg.text)} `;
    }
    const idx = joined.indexOf(q);
    if (idx < 0) continue;
    let sec = starts[0]!.sec;
    for (const s of starts) if (s.at <= idx) sec = s.sec;
    return Math.round(sec);
  }
  return undefined;
}

const KINDS = new Set<string>(KIND_ORDER);
const CERT = new Set(["ясно", "неясно", "проверить"]);
const clip = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Ответ сервера → факты книги. Цитата проверяется ещё раз по полному тексту; нет цитаты в тексте – нет факта. */
export function acceptFacts(raw: RawFact[], text: string, segments: Seg[], makeId: () => string): { facts: InterviewFact[]; dropped: number } {
  const facts: InterviewFact[] = [];
  let dropped = 0;
  for (const r of raw) {
    const found = r && typeof r === "object" && typeof r.quote === "string" ? findQuote(text, r.quote) : null;
    const title = clip(r?.title, 120);
    if (!found || !KINDS.has(r.kind) || !title) {
      dropped += 1;
      continue;
    }
    let certainty = (CERT.has(r.certainty ?? "") ? r.certainty : "ясно") as InterviewFact["certainty"];
    if (found === "loose" && certainty === "ясно") certainty = "проверить";
    facts.push({
      id: makeId(),
      kind: r.kind as FactKind,
      title,
      detail: clip(r.detail, 400),
      relation: clip(r.relation, 120),
      years: clip(r.years, 60),
      place: clip(r.place, 120),
      quote: clip(r.quote, 400),
      certainty,
      note: clip(r.note, 240),
      at: locateQuote(segments, r.quote),
      review: "new",
    });
  }
  return { facts, dropped };
}

const worse = (a: InterviewFact["certainty"], b: InterviewFact["certainty"]) => (a === "неясно" || b === "неясно" ? "неясно" : a === "проверить" || b === "проверить" ? "проверить" : "ясно");

/** Один ли это факт. Одинаковые имена с разным родством – РАЗНЫЕ люди, их не склеиваем. */
export function sameFact(a: InterviewFact, b: InterviewFact): boolean {
  if (a.kind !== b.kind) return false;
  if (loose(a.quote) === loose(b.quote)) return a.kind !== "people" || loose(a.title) === loose(b.title);
  if (loose(a.title) !== loose(b.title)) return false;
  if (a.kind === "people") {
    const ra = loose(a.relation), rb = loose(b.relation);
    if (ra && rb && ra !== rb) return false;
    const ya = loose(a.years), yb = loose(b.years);
    if (ya && yb && ya !== yb) return false;
  }
  return true;
}

/** Слияние найденного в кусках: дубли (в том числе из перекрытий) объединяются, лучшее из полей сохраняется. */
export function mergeFacts(existing: InterviewFact[], incoming: InterviewFact[]): InterviewFact[] {
  const out = existing.slice();
  for (const fact of incoming) {
    const i = out.findIndex((x) => sameFact(x, fact));
    if (i < 0) {
      out.push(fact);
      continue;
    }
    const old = out[i]!;
    // Уже оценённое Дариной не трогаем, кроме добавления недостающих полей.
    out[i] = {
      ...old,
      detail: old.detail.length >= fact.detail.length ? old.detail : fact.detail,
      relation: old.relation || fact.relation,
      years: old.years || fact.years,
      place: old.place || fact.place,
      note: old.note || fact.note,
      certainty: old.review === "confirmed" ? old.certainty : worse(old.certainty, fact.certainty),
      at: old.at ?? fact.at,
    };
  }
  return out;
}

/** «Нашла: 12 людей, 5 мест…» */
export function foundLine(facts: InterviewFact[]): string {
  const live = facts.filter((f) => f.review !== "wrong");
  const count = (k: FactKind) => live.filter((f) => f.kind === k).length;
  const parts: string[] = [];
  const add = (k: FactKind, one: string, few: string, many: string) => {
    const n = count(k);
    if (n) parts.push(plural(n, one, few, many));
  };
  add("people", "человека", "человека", "людей");
  add("places", "место", "места", "мест");
  add("dates", "дату", "даты", "дат");
  add("events", "событие", "события", "событий");
  add("objects", "предмет", "предмета", "предметов");
  add("occupations", "занятие", "занятия", "занятий");
  add("surnames", "фамилию", "фамилии", "фамилий");
  add("traditions", "традицию", "традиции", "традиций");
  add("quotes", "фразу", "фразы", "фраз");
  const unclear = count("unclear") + live.filter((f) => f.kind !== "unclear" && f.certainty !== "ясно").length;
  const base = parts.length ? `Нашла: ${parts.join(", ")}` : "Пока ничего не нашла";
  return unclear ? `${base}. Неясного: ${unclear}` : base;
}

export type RunDeps = {
  call: (text: string, requestId: string) => Promise<AiResult<{ facts: RawFact[]; dropped: number }>>;
  makeId: () => string;
  /** Вызывается после каждого куска: накопленные факты, сколько кусков готово. */
  onProgress?: (state: { facts: InterviewFact[]; done: number; total: number; dropped: number }) => void;
  stopped?: () => boolean;
  nonce?: () => string;
};

export type RunResult = { facts: InterviewFact[]; done: number; total: number; dropped: number; error?: { message: string; code: string; resetAt?: string }; paused?: boolean };

/** Разбор интервью по кускам с позиции `from` (продолжение после сбоя). Уже найденное сохраняется, при отказе сервера возвращается честная причина. */
export async function runExtraction(interview: Pick<Interview, "id" | "text" | "segments" | "facts" | "dropped">, deps: RunDeps, from = 0): Promise<RunResult> {
  const text = stripMarks(interview.text);
  const chunks = chunkText(text);
  let facts = interview.facts;
  let dropped = interview.dropped;
  let done = from;
  for (; done < chunks.length; done += 1) {
    if (deps.stopped?.()) return { facts, done, total: chunks.length, dropped, paused: true };
    const id = `${interview.id}:f${done}:${deps.nonce ? deps.nonce() : Date.now().toString(36)}`;
    let answer = await deps.call(chunks[done]!, id);
    if (!answer.ok && answer.code === "network") answer = await deps.call(chunks[done]!, `${id}:r`);
    if (!answer.ok) return { facts, done, total: chunks.length, dropped, error: { message: answer.message, code: answer.code, resetAt: answer.resetAt } };
    const got = acceptFacts(answer.data.facts ?? [], text, interview.segments, deps.makeId);
    facts = mergeFacts(facts, got.facts);
    dropped += got.dropped + (answer.data.dropped ?? 0);
    deps.onProgress?.({ facts, done: done + 1, total: chunks.length, dropped });
  }
  return { facts, done: chunks.length, total: chunks.length, dropped };
}
