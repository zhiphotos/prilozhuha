/**
 * Автоматический обмен книгой с родственниками: решения без сети и без хранилища, чтобы их можно было проверить сценариями.
 * Реальные запросы, хранилище и фото подставляет helper.ts.
 */
import { HELPER_KEYS, makeChangeSet, type Book } from "./helper-changes.ts";
import { judge, mergeVerdicts, type Verdict } from "./helper-verdicts.ts";
import { mergeList, valueEqual, type Rec } from "./merge-core.ts";

export type AutoSession = { room: string; invite: string; who?: string; base: Book; baseAt?: number;
  /** Что помощник уже отправил (его книга в момент отправки). base остаётся версией владельца. Нет поля: ничего не ждёт решения (старые сессии). */
  sent?: Book;
  /** Решения владельца по отправленному: принято, не принято, конфликт. Хранятся в сессии, поэтому переживают перезапуск. */
  verdicts?: Verdict[] };
export type PollAnswer = { ok?: boolean; same?: boolean; base?: Book; at?: number; waiting?: number };

export interface HelperDeps<S extends AutoSession> {
  session(): S | null;
  saveSession(session: S): void;
  lists(): Book;
  setLists(patch: Record<string, unknown>): void;
  /** Отправляет правки и запоминает, что отправлено (меняет base у сессии). */
  send(session: S, who: string): Promise<void>;
  poll(session: S): Promise<PollAnswer>;
  downloadMedia(session: S, base: Book): Promise<void>;
}

export type HelperResult = "no-session" | "no-who" | "waiting" | "idle" | "updated" | "held" | "skipped";

/** Неотправленное: отличие книги помощника от того, что он уже отправил (а если не отправлял, от версии владельца). */
const pending = (session: AutoSession, current: Book) => makeChangeSet(session.sent ?? session.base, current).length;

/** Один обход помощника: отправить свои правки, потом забрать свежую версию владельца, ничего не затирая. */
export async function helperRoundWith<S extends AutoSession>(d: HelperDeps<S>): Promise<HelperResult> {
  let session = d.session();
  if (!session) return "no-session";
  if (pending(session, d.lists())) {
    if (!session.who) return "no-who";
    await d.send(session, session.who);
    session = d.session() ?? session;
  }
  if (pending(session, d.lists())) return "skipped";
  const answer = await d.poll(session);
  if (!answer.ok || answer.same || !answer.base) return "idle";
  if ((answer.waiting ?? 0) > 0) return "waiting"; // владелец ещё не разобрал мои правки: поверх них новое не кладём
  await d.downloadMedia(session, answer.base);
  const now = d.session();
  if (!now || now.room !== session.room || pending(now, d.lists())) return "skipped"; // за время загрузки что-то изменилось
  // Владелец выложил новую версию и ящик пуст: всё, что помощник отправлял и чего в ней нет, остаётся у него, а не затирается
  const judged = now.sent ? judge(now.base, now.sent, answer.base, Date.now(), now.verdicts) : { held: [], verdicts: [] };
  const held = judged.held;
  // Версия владельца берётся целиком; поверх неё остаётся то, что помощник отправил и чего владелец не принял. Слияние делает merge-core:
  // ours = книга помощника, theirs = версия владельца. Спорное остаётся значением помощника, значение владельца хранится в verdicts; чистые правки обеих сторон складываются.
  const patch: Record<string, unknown> = {};
  const mine = d.lists();
  for (const key of HELPER_KEYS) {
    const owner = (answer.base[key] as Rec[] | undefined) ?? [];
    if (!now.sent || !held.length) {
      patch[key] = owner; // ничего не отправляли или всё принято: просто версия владельца
      continue;
    }
    const result = mergeList(now.base[key], mine[key], owner);
    const byId = new Map(owner.map((r) => [r.id, r]));
    const removed = new Set(result.removals.map((m) => m.id)); // владелец убрал запись, которую помощник не менял: убираем и у него
    const kept = new Map(result.merged.filter((r) => !removed.has(r.id)).map((r) => [r.id, r]));
    // порядок как у владельца, записи только у помощника в конце; запись, совпавшая по значению с записью владельца, берётся его объектом (порядок ключей не создаёт ложных «правок»)
    const ordered = [...owner.map((r) => r.id).filter((id) => kept.has(id)), ...[...kept.keys()].filter((id) => !byId.has(id))];
    patch[key] = ordered.map((id) => (byId.has(id) && valueEqual(byId.get(id), kept.get(id)) ? byId.get(id)! : kept.get(id)!));
  }
  d.setLists(patch);
  // отправленное, но не принятое ждёт решения помощника: само не уйдёт второй раз и не пропадёт
  d.saveSession({ ...now, base: answer.base, baseAt: answer.at, sent: held.length ? (patch as Book) : undefined, verdicts: mergeVerdicts(now.verdicts, judged.verdicts) });
  return held.length ? "held" : "updated";
}

export const signature = (value: unknown): string => {
  const text = JSON.stringify(value);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return `${text.length}:${hash}`;
};

export interface OwnerDeps {
  hasRoom(): boolean;
  lastSignature(): string | null;
  lists(): Book;
  publish(): Promise<void>;
}

/** Владелец: выложить книгу заново, если она изменилась с последней выкладки (и если помощникам её вообще открывали). */
export async function publishIfChangedWith(d: OwnerDeps): Promise<boolean> {
  const last = d.lastSignature();
  if (!d.hasRoom() || last === null) return false;
  if (signature(d.lists()) === last) return false;
  await d.publish();
  return true;
}
