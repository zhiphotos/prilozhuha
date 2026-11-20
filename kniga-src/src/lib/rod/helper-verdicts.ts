/**
 * Решения владельца по правкам помощника: что ждёт решения, что принято, что не принято, где конфликт.
 * Чистые функции без сети и браузера. Записи лежат в сессии помощника (localStorage), поэтому переживают перезапуск.
 * Не принятые правки здесь только описываются: сами они остаются в книге помощника, ничего не удаляется и не перезаписывается.
 */
import { makeChangeSet, type Book, type Change, type HelperKey, type Rec } from "./helper-changes.ts";

export type VerdictState = "accepted" | "rejected" | "conflict";
export type Verdict = {
  key: HelperKey;
  id: string;
  kind: Change["kind"];
  state: VerdictState;
  at: number;
  /** Запись помощника на момент решения (для подписи в списке). */
  mine?: Rec;
  /** Конфликт: запись так, как её изменил владелец. */
  theirs?: Rec;
  /** Конфликт: поля, которые изменили оба и по-разному. */
  fields?: string[];
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const listOf = (book: Book, key: string): Rec[] => (Array.isArray(book[key]) ? (book[key] as Rec[]) : []);
const recOf = (book: Book, key: string, id: string): Rec | undefined => listOf(book, key).find((r) => r.id === id);

/** Поля, которые менял и помощник, и владелец, и теперь значения разные. */
export function conflictFields(before: Rec | undefined, mine: Rec | undefined, theirs: Rec | undefined): string[] {
  const names = new Set([...Object.keys(before ?? {}), ...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})]);
  return [...names].filter((f) => !same(before?.[f], mine?.[f]) && !same(before?.[f], theirs?.[f]) && !same(mine?.[f], theirs?.[f]));
}

export const MAX_ACCEPTED = 20;

/**
 * Сверка отправленного с новой версией владельца.
 * Принято: в версии владельца запись такая же, как у помощника. Конфликт: владелец сам менял эту запись и она отличается.
 * Не принято: владелец эту запись не менял и помощника не принял.
 */
export function judge(base: Book, sent: Book, owner: Book, at: number): { held: Change[]; verdicts: Verdict[] } {
  const held: Change[] = [];
  const verdicts: Verdict[] = [];
  for (const c of makeChangeSet(base, sent)) {
    const theirs = recOf(owner, c.key, c.id);
    const accepted = c.kind === "remove" ? !theirs : same(theirs, c.after);
    const mine = c.after ?? c.before;
    if (accepted) {
      verdicts.push({ key: c.key, id: c.id, kind: c.kind, state: "accepted", at, mine });
      continue;
    }
    held.push(c);
    const fields = c.kind === "edit" ? conflictFields(c.before, c.after, theirs) : [];
    // правка записи спорна, только если владелец менял те же поля; добавление или удаление – если он сам трогал эту запись
    const clash = c.kind === "edit" ? fields.length > 0 : !same(theirs, recOf(base, c.key, c.id));
    if (clash) verdicts.push({ key: c.key, id: c.id, kind: c.kind, state: "conflict", at, mine, theirs, fields });
    else verdicts.push({ key: c.key, id: c.id, kind: c.kind, state: "rejected", at, mine });
  }
  return { held, verdicts };
}

/** Новое решение заменяет прежнее по той же записи; принятые показываются только из последнего решения владельца. */
export function mergeVerdicts(prev: Verdict[] | undefined, next: Verdict[]): Verdict[] {
  const fresh = next.filter((v) => v.state === "accepted").slice(0, MAX_ACCEPTED);
  const open = next.filter((v) => v.state !== "accepted");
  const stay = (prev ?? []).filter((v) => !next.some((n) => n.key === v.key && n.id === v.id));
  const oldOpen = stay.filter((v) => v.state !== "accepted");
  const oldAccepted = stay.filter((v) => v.state === "accepted");
  return [...oldOpen, ...open, ...(fresh.length ? fresh : oldAccepted)];
}

/** После «Отправить снова» или «Сбросить» записи не принятого убираются, принятые остаются. */
export const dropOpen = (verdicts: Verdict[] | undefined): Verdict[] => (verdicts ?? []).filter((v) => v.state === "accepted");

export type Overview = {
  /** Не отправлено: изменено после последней отправки. */
  fresh: number;
  /** Отправлено, решения владельца ещё нет. */
  waiting: Change[];
  accepted: Verdict[];
  rejected: Verdict[];
  conflicts: Verdict[];
};

type SessionLike = { base: Book; sent?: Book; verdicts?: Verdict[] };

/** Сводка для экрана помощника: считается только из сохранённой сессии и текущей книги. */
export function overview(session: SessionLike, current: Book): Overview {
  const verdicts = session.verdicts ?? [];
  const sentChanges = session.sent ? makeChangeSet(session.base, session.sent) : [];
  const decided = (c: Change) => verdicts.some((v) => v.key === c.key && v.id === c.id && v.state !== "accepted");
  return {
    fresh: makeChangeSet(session.sent ?? session.base, current).length,
    waiting: sentChanges.filter((c) => !decided(c)),
    accepted: verdicts.filter((v) => v.state === "accepted"),
    rejected: verdicts.filter((v) => v.state === "rejected" && sentChanges.some((c) => c.key === v.key && c.id === v.id)),
    conflicts: verdicts.filter((v) => v.state === "conflict" && sentChanges.some((c) => c.key === v.key && c.id === v.id)),
  };
}
