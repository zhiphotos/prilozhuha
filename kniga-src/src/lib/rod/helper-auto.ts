/**
 * Автоматический обмен книгой с родственниками: решения без сети и без хранилища, чтобы их можно было проверить сценариями.
 * Реальные запросы, хранилище и фото подставляет helper.ts.
 */
import { HELPER_KEYS, makeChangeSet, type Book } from "./helper-changes.ts";

export type AutoSession = { room: string; invite: string; who?: string; base: Book; baseAt?: number };
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

export type HelperResult = "no-session" | "no-who" | "waiting" | "idle" | "updated" | "skipped";

const pending = (session: AutoSession, current: Book) => makeChangeSet(session.base, current).length;

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
  const patch: Record<string, unknown> = {};
  for (const key of HELPER_KEYS) patch[key] = answer.base[key] ?? [];
  d.setLists(patch);
  d.saveSession({ ...now, base: answer.base, baseAt: answer.at });
  return "updated";
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
