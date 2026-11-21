/**
 * Правки помощника: что изменилось у помощника относительно версии, которую он получил от владельца (base),
 * и как применить это к книге владельца, даже если владелец за это время тоже правил.
 *
 * Сравнение идёт по id записи и по полям (трёхстороннее слияние: base, версия владельца, версия помощника):
 *  - новая запись помощника всегда добавляется;
 *  - запись правили только помощник: правка применяется;
 *  - правили оба, но разные поля: поля складываются;
 *  - правили оба одно и то же поле: конфликт, решает владелец;
 *  - удаление помощника только предлагается и не применяется само.
 */
export const HELPER_KEYS = ["people", "places", "stories", "notes", "pages", "photos"] as const;
export type HelperKey = (typeof HELPER_KEYS)[number];

export type Rec = { id: string } & Record<string, unknown>;
export type Book = Partial<Record<string, unknown>>;

export type Change = { key: HelperKey; kind: "add" | "edit" | "remove"; id: string; before?: Rec; after?: Rec };

import { decide, mergeRecord, stableStringify, type ConflictKind, type Decision as CoreDecision, type RecordMerge } from "./merge-core.ts";

export type ReviewState = "clean" | "conflict" | "already" | "gone" | "remove";
export type ReviewItem = {
  key: HelperKey;
  id: string;
  kind: Change["kind"];
  state: ReviewState;
  /** Что получится, если принять (для конфликта: версия помощника поверх версии владельца). */
  result?: Rec;
  mine?: Rec;
  theirs?: Rec;
  /** Поля, которые правили оба и по-разному. */
  fields: string[];
  /** Поля, которые поменял помощник. */
  touched: string[];
  /** Слияние записи из merge-core: по нему применяются решения, поверх ТЕКУЩЕЙ записи владельца. */
  merge?: RecordMerge;
  /** Вид конфликта, если state = «conflict». */
  conflictKind?: ConflictKind;
  /** Добавление записи, которую владелец раньше выкладывал помощникам, а сейчас её у него нет: показывается как новое предложение, по умолчанию «Не надо». */
  wasPublished?: boolean;
  /** Владелец изменил эту запись после того, как предложение было показано: разбор сделан заново, спор виден с обеими версиями. */
  changedSince?: boolean;
};

export type Decision = "accept" | "reject" | "theirs" | "mine" | "copy";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isRecs = (value: unknown): value is Rec[] => Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof (item as Rec).id === "string");
const list = (book: Book, key: string): Rec[] => (isRecs(book[key]) ? (book[key] as Rec[]) : []);

const changedFields = (from: Rec | undefined, to: Rec | undefined): string[] => {
  const keys = new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})]);
  return [...keys].filter((field) => !same(from?.[field], to?.[field]));
};

/** Что изменил помощник: сравнение его книги с версией, которую он получил. */
export function makeChangeSet(base: Book, current: Book): Change[] {
  const out: Change[] = [];
  for (const key of HELPER_KEYS) {
    const before = new Map(list(base, key).map((r) => [r.id, r]));
    const now = new Map(list(current, key).map((r) => [r.id, r]));
    for (const [id, after] of now) {
      const old = before.get(id);
      if (!old) out.push({ key, kind: "add", id, after });
      else if (!same(old, after)) out.push({ key, kind: "edit", id, before: old, after });
    }
    for (const [id, before_] of before) if (!now.has(id)) out.push({ key, kind: "remove", id, before: before_ });
  }
  return out;
}

/** id записей, которые владелец раньше выкладывал помощникам (хранятся у него локально). */
export type PublishedIds = Partial<Record<string, string[]>>;

/** Дописывает id записей выкладываемой книги к уже известным. Список только растёт: удалённая позже запись остаётся в нём, по нему и узнаётся. */
export function rememberPublished(prev: PublishedIds | undefined, base: Book): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const key of HELPER_KEYS) out[key] = [...new Set([...(prev?.[key] ?? []), ...list(base, key).map((r) => r.id)])];
  return out;
}

/**
 * Сверяет правки помощника с текущей книгой владельца. Слияние делает merge-core: base = запись, как её получил помощник,
 * ours = текущая запись владельца, theirs = запись помощника. Здесь только перевод результата в состояния экрана.
 */
export function reviewChanges(mine: Book, changes: Change[], opts: { published?: PublishedIds } = {}): ReviewItem[] {
  return changes
    .filter((c) => (HELPER_KEYS as readonly string[]).includes(c.key))
    .map((c): ReviewItem => {
      const mineRec = list(mine, c.key).find((r) => r.id === c.id);
      const merge = mergeRecord(c.id, c.kind === "add" ? undefined : c.before, mineRec, c.kind === "remove" ? undefined : c.after);
      const base: ReviewItem = { key: c.key, id: c.id, kind: c.kind, state: "already", mine: mineRec, theirs: c.after, fields: [], touched: changedFields(c.kind === "add" ? undefined : c.before, c.after), merge };
      if (merge.status === "same") return base;
      if (merge.status === "remove") return { ...base, state: "remove" };
      if (merge.status === "take") {
        const wasPublished = c.kind === "add" && !mineRec && Boolean(opts.published?.[c.key]?.includes(c.id));
        return { ...base, state: "clean", result: merge.merged, touched: c.kind === "add" ? changedFields(undefined, c.after) : base.touched, ...(wasPublished ? { wasPublished: true } : {}) };
      }
      // conflict: result = версия помощника поверх версии владельца (если помощник просит убрать запись, результата нет)
      const result = merge.theirs ? decide(mineRec ? [mineRec] : [], merge, "theirs").find((r) => r.id === c.id) : undefined;
      return { ...base, state: "conflict", result, conflictKind: merge.kind, fields: merge.kind === "fields" || merge.kind === "add-add" ? merge.fields.map((f) => f.field) : [], touched: c.kind === "add" ? changedFields(undefined, c.after) : base.touched };
    });
}

/** Решения по умолчанию: безопасное принимаем, конфликты, удаления и записи, которых у владельца нет «со времён выкладки», не трогаем, пока владелец не решит. */
export const defaultDecision = (item: ReviewItem): Decision => (item.wasPublished ? "reject" : item.state === "clean" ? "accept" : "reject");

const toCore = (d: Decision): CoreDecision => (d === "reject" || d === "mine" ? "ours" : d === "copy" ? "copy" : "theirs");

/**
 * Применяет решения владельца. Возвращает только изменившиеся списки.
 * Решения накладываются на ТЕКУЩУЮ книгу (mine), а не на снимок на момент разбора: поля, которые владелец успел изменить, не затираются.
 * Повторное применение того же решения ничего не дублирует: копия получает id из содержимого, чистые изменения идемпотентны.
 * Пометка копии хранится в отдельных полях copyOf и copyLabel, название и имя не меняются.
 */
export function applyReview(mine: Book, items: ReviewItem[], decisions: Record<string, Decision>, label = "от помощника"): Partial<Record<HelperKey, Rec[]>> {
  const out: Partial<Record<HelperKey, Rec[]>> = {};
  for (const key of HELPER_KEYS) {
    const before = list(mine, key);
    let next = before;
    for (const item of items.filter((i) => i.key === key)) {
      if (item.state === "already" || !item.merge) continue;
      const decision = decisions[`${item.key}:${item.id}`] ?? defaultDecision(item);
      next = decide(next, item.merge, toCore(decision), label) as Rec[];
    }
    if (stableStringify(next) !== stableStringify(before)) out[key] = next;
  }
  return out;
}

/**
 * Применение с проверкой «не изменилась ли запись, пока владелец решал».
 * Если запись владельца после показа карточки изменилась, а решение было «принять» (или «версия помощника»), оно не применяется молча:
 * предложение сверяется заново с текущей записью, и если теперь есть спор, оно возвращается в `stale` с обеими версиями.
 * Решения «оставить моё» и «копией» безопасны и применяются как есть. Остальные предложения применяются обычным образом.
 */
export function applyReviewChecked(
  mine: Book,
  changes: Change[],
  items: ReviewItem[],
  decisions: Record<string, Decision>,
  label = "от помощника",
  opts: { published?: PublishedIds } = {},
): { patch: Partial<Record<HelperKey, Rec[]>>; stale: ReviewItem[] } {
  const stale: ReviewItem[] = [];
  const ok: ReviewItem[] = [];
  for (const item of items) {
    const cur = list(mine, item.key).find((r) => r.id === item.id);
    const drifted = item.state !== "already" && stableStringify(cur ?? null) !== stableStringify(item.mine ?? null);
    const decision = decisions[`${item.key}:${item.id}`] ?? defaultDecision(item);
    if (!drifted || decision === "reject" || decision === "mine" || decision === "copy") {
      ok.push(item);
      continue;
    }
    const change = changes.find((c) => c.key === item.key && c.id === item.id);
    const fresh = change ? reviewChanges(mine, [change], opts)[0] : undefined;
    if (fresh && fresh.state === "conflict") stale.push({ ...fresh, changedSince: true });
    else if (fresh) ok.push(fresh); // спора нет: либо уже совпало, либо чисто накладывается на текущую запись
  }
  const patch = applyReview(mine, ok, decisions, label);
  return { patch, stale };
}

export const summarize = (items: ReviewItem[]) => ({
  added: items.filter((i) => i.kind === "add" && i.state !== "already").length,
  edited: items.filter((i) => i.kind === "edit" && i.state !== "already").length,
  removed: items.filter((i) => i.kind === "remove" && i.state !== "already").length,
  conflicts: items.filter((i) => i.state === "conflict").length,
});
