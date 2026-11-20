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
  /** Конфликт отправлен владельцу ещё раз: значения и сам факт конфликта остаются, пока он не решит. */
  resent?: boolean;
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
export function judge(base: Book, sent: Book, owner: Book, at: number, prev: Verdict[] = []): { held: Change[]; verdicts: Verdict[] } {
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
    else {
      // конфликт, о котором помощник уже знает, не превращается в обычный отказ после «Отправить снова»: значения владельца на тот момент хранятся
      const old = prev.find((v) => v.key === c.key && v.id === c.id && v.state === "conflict");
      if (old) verdicts.push({ ...old, at, mine, resent: undefined });
      else verdicts.push({ key: c.key, id: c.id, kind: c.kind, state: "rejected", at, mine });
    }
  }
  return { held, verdicts };
}

export const MAX_HISTORY = 50;

/** Новое решение заменяет прежнее по той же записи. Принятое копится в истории (до 50), баннер берёт из неё только последнее решение. */
export function mergeVerdicts(prev: Verdict[] | undefined, incoming: Verdict[]): Verdict[] {
  // решения идут строго одно за другим, даже если часы показали то же время (или ушли назад): иначе «последнее решение» не определить
  const floor = (prev ?? []).reduce((m, v) => Math.max(m, v.at), 0);
  const next = incoming.map((v) => ({ ...v, at: Math.max(v.at, floor + 1) }));
  const stay = (prev ?? []).filter((v) => !next.some((n) => n.key === v.key && n.id === v.id));
  const accepted = [...stay.filter((v) => v.state === "accepted"), ...next.filter((v) => v.state === "accepted")].slice(-MAX_HISTORY);
  const open = [...stay.filter((v) => v.state !== "accepted"), ...next.filter((v) => v.state !== "accepted")];
  return [...open, ...accepted];
}

/** «Отправить снова»: обычный отказ снимается, конфликт остаётся и помечается как отправленный ещё раз. */
export const markResent = (verdicts: Verdict[] | undefined, changes: Change[]): Verdict[] =>
  (verdicts ?? []).flatMap((v) => {
    if (v.state === "accepted" || !changes.some((c) => c.key === v.key && c.id === v.id)) return [v];
    return v.state === "conflict" ? [{ ...v, resent: true }] : [];
  });

/** «Сбросить»: все не принятые записи убираются (это явное решение помощника), история принятого остаётся. */
export const dropOpen = (verdicts: Verdict[] | undefined): Verdict[] => (verdicts ?? []).filter((v) => v.state === "accepted");

export type Overview = {
  /** Не отправлено: изменено после последней отправки. */
  fresh: number;
  /** Отправлено, решения владельца ещё нет. */
  waiting: Change[];
  /** Принято в последнем решении владельца; пока есть новая работа (неотправленное или ждущее решения), не показывается. */
  accepted: Verdict[];
  /** Вся история принятого (до 50). */
  history: Verdict[];
  rejected: Verdict[];
  conflicts: Verdict[];
};

type SessionLike = { base: Book; sent?: Book; verdicts?: Verdict[] };

/** Сводка для экрана помощника: считается только из сохранённой сессии и текущей книги. */
export function overview(session: SessionLike, current: Book): Overview {
  const verdicts = session.verdicts ?? [];
  const sentChanges = session.sent ? makeChangeSet(session.base, session.sent) : [];
  const alive = makeChangeSet(session.base, current); // записи помощника, которые всё ещё отличаются от версии владельца
  const stillMine = (v: Verdict) => alive.some((c) => c.key === v.key && c.id === v.id);
  const decided = (c: Change) => verdicts.some((v) => v.key === c.key && v.id === c.id && v.state !== "accepted" && !v.resent);
  const fresh = makeChangeSet(session.sent ?? session.base, current).length;
  const waiting = sentChanges.filter((c) => !decided(c) && !verdicts.some((v) => v.key === c.key && v.id === c.id && v.state === "conflict"));
  const history = verdicts.filter((v) => v.state === "accepted");
  const lastAt = history.reduce((m, v) => Math.max(m, v.at), 0);
  return {
    fresh,
    waiting,
    history,
    accepted: fresh === 0 && waiting.length === 0 && !verdicts.some((v) => v.resent) ? history.filter((v) => v.at === lastAt) : [], // конфликт, отправленный снова, тоже новая отправка
    rejected: verdicts.filter((v) => v.state === "rejected" && stillMine(v)),
    conflicts: verdicts.filter((v) => v.state === "conflict" && stillMine(v)),
  };
}
