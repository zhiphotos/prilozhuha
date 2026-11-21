/**
 * Снимок СТАРОЙ логики стороны владельца (reviewChanges, applyReview) до подключения merge-core (С-3г).
 * Нужен только тестам для параллельного сравнения старого и нового поведения. В приложении не используется.
 */
import { HELPER_KEYS, type Book, type Change, type Decision, type HelperKey, type Rec, type ReviewItem } from "./helper-changes.ts";

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isRecs = (value: unknown): value is Rec[] => Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof (item as Rec).id === "string");
const list = (book: Book, key: string): Rec[] => (isRecs(book[key]) ? (book[key] as Rec[]) : []);
const changedFields = (from: Rec | undefined, to: Rec | undefined): string[] => {
  const keys = new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})]);
  return [...keys].filter((field) => !same(from?.[field], to?.[field]));
};

/** Сверяет правки помощника с текущей книгой владельца. */
export function legacyReview(mine: Book, changes: Change[]): ReviewItem[] {
  const byKey = (key: string) => new Map(list(mine, key).map((r) => [r.id, r]));
  const maps = Object.fromEntries(HELPER_KEYS.map((k) => [k, byKey(k)])) as Record<HelperKey, Map<string, Rec>>;
  return changes
    .filter((c) => (HELPER_KEYS as readonly string[]).includes(c.key))
    .map((c): ReviewItem => {
      const mineRec = maps[c.key].get(c.id);
      const base = { key: c.key, id: c.id, kind: c.kind, mine: mineRec, theirs: c.after, fields: [] as string[], touched: changedFields(c.before, c.after) };
      if (c.kind === "add") {
        if (!mineRec) return { ...base, state: "clean", result: c.after };
        return same(mineRec, c.after) ? { ...base, state: "already" } : { ...base, state: "conflict", result: c.after, fields: changedFields(mineRec, c.after), touched: changedFields(undefined, c.after) };
      }
      if (c.kind === "remove") {
        if (!mineRec) return { ...base, state: "already" };
        return { ...base, state: "remove" };
      }
      // edit
      if (!mineRec) return { ...base, state: "gone", result: c.after };
      if (same(mineRec, c.after)) return { ...base, state: "already" };
      const ownerFields = new Set(changedFields(c.before, mineRec));
      const clash = base.touched.filter((f) => ownerFields.has(f) && !same(mineRec[f], c.after?.[f]));
      const merged: Rec = { ...mineRec };
      for (const f of base.touched) {
        if (clash.includes(f)) continue;
        if (c.after && f in c.after) merged[f] = c.after[f];
        else delete merged[f];
      }
      if (!clash.length) return { ...base, state: "clean", result: merged };
      const theirsWins: Rec = { ...merged };
      for (const f of clash) {
        if (c.after && f in c.after) theirsWins[f] = c.after[f];
        else delete theirsWins[f];
      }
      return { ...base, state: "conflict", result: theirsWins, fields: clash };
    });
}

/** Решения по умолчанию: безопасное принимаем, конфликты и удаления не трогаем, пока владелец не решит. */
export const legacyDefaultDecision = (item: ReviewItem): Decision => (item.state === "clean" || item.state === "gone" ? "accept" : "reject");

const withCopyId = (rec: Rec, label: string): Rec => ({ ...rec, id: `${rec.id}-c${Math.random().toString(36).slice(2, 6)}`, ...("title" in rec ? { title: `${String(rec.title ?? "")} (${label})`.trim() } : {}), ...("name" in rec && !("title" in rec) ? { name: `${String(rec.name ?? "")} (${label})`.trim() } : {}) });

/** Применяет решения владельца. Возвращает только изменившиеся списки. */
export function legacyApply(mine: Book, items: ReviewItem[], decisions: Record<string, Decision>, label = "от помощника"): Partial<Record<HelperKey, Rec[]>> {
  const out: Partial<Record<HelperKey, Rec[]>> = {};
  const keyOf = (item: ReviewItem) => `${item.key}:${item.id}`;
  for (const key of HELPER_KEYS) {
    const mine_ = list(mine, key);
    let next = [...mine_];
    let touched = false;
    for (const item of items.filter((i) => i.key === key)) {
      const decision = decisions[keyOf(item)] ?? legacyDefaultDecision(item);
      if (decision === "reject" || decision === "mine" || item.state === "already") continue;
      touched = true;
      if (item.kind === "remove") {
        if (decision === "accept") next = next.filter((r) => r.id !== item.id);
        continue;
      }
      if (!item.result) continue;
      if (decision === "copy") {
        const source = item.theirs ?? item.result;
        next = [...next, withCopyId(source, label)];
        continue;
      }
      const exists = next.some((r) => r.id === item.id);
      next = exists ? next.map((r) => (r.id === item.id ? (item.result as Rec) : r)) : [...next, item.result];
    }
    if (touched) out[key] = next;
  }
  return out;
}

