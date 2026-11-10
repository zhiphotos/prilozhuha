import { API_BASE } from "@/lib/rod/config";
import { HELPER_KEYS, applyReview, makeChangeSet, reviewChanges, type Book, type Change, type Decision, type ReviewItem } from "@/lib/rod/helper-changes";
import { isMediaRef } from "@/lib/rod/media";
import { createRoom } from "@/lib/rod/family";
import { flushBook, useRod } from "@/lib/rod/store";

/** Фото остаются у владельца: в версию для помощников и в правки уходят только текст и связи (ссылки на фото убираются). */
const stripMedia = (value: unknown): unknown => {
  if (typeof value === "string") return isMediaRef(value) || value.startsWith("data:") ? "" : value;
  if (Array.isArray(value)) return value.map(stripMedia);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripMedia(v)]));
  return value;
};

const lists = (): Book => {
  const state = useRod.getState() as unknown as Record<string, unknown>;
  return Object.fromEntries(HELPER_KEYS.map((key) => [key, stripMedia(state[key] ?? [])])) as Book;
};

const post = async <T,>(path: string, body: unknown): Promise<T & { error?: string }> => {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json().catch(() => ({ error: "Сервер не ответил." }))) as T & { error?: string };
};

/** Владелец: выложить текущую версию книги, чтобы помощники взяли её за основу. */
export async function publishBase(): Promise<void> {
  if (!useRod.getState().room) await createRoom("Наша семья");
  const room = useRod.getState().room;
  if (!room) throw new Error("Не получилось создать ссылку.");
  const base = lists();
  base.pages = []; // страницы помощники пока только добавляют новые: у владельца они с фото
  const answer = await post<{ ok?: boolean }>("/api/room-base", { room: room.id, ownerKey: room.ownerKey, base });
  if (!answer.ok) throw new Error(answer.error || "Не получилось открыть книгу для правок.");
}

const KEY = "kniga-helper";
export type HelperSession = { room: string; invite: string; name: string; base: Book };

export function helperSession(): HelperSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as HelperSession) : null;
  } catch {
    return null;
  }
}
const saveSession = (session: HelperSession | null) => {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* без сохранения помощник просто откроет ссылку ещё раз */
  }
};

/** Помощник: взять версию владельца и работать с ней в этом приложении. Свою книгу не затираем: только если она пустая. */
export async function joinAsHelper(room: string, invite: string): Promise<void> {
  const existing = helperSession();
  if (existing?.room === room) return;
  const state = useRod.getState();
  if (state.people.length || state.pages.length || state.stories.length) throw new Error("В этом браузере уже есть чья-то книга, мы её не тронем. Откройте ссылку в другом браузере или на другом устройстве.");
  const answer = await post<{ ok?: boolean; base?: Book; name?: string }>("/api/room-base", { room, invite });
  if (!answer.ok || !answer.base) throw new Error(answer.error || "Не получилось открыть книгу.");
  const patch: Record<string, unknown> = { onboarded: true, audience: "family", dedicatee: "", collector: "" };
  for (const key of HELPER_KEYS) patch[key] = answer.base[key] ?? [];
  useRod.setState(patch);
  flushBook();
  saveSession({ room, invite, name: answer.name ?? "Семья", base: answer.base });
}

export const helperChanges = (session: HelperSession): Change[] => makeChangeSet(session.base, lists());

export async function sendChanges(session: HelperSession, who: string): Promise<number> {
  const changes = helperChanges(session);
  if (!changes.length) throw new Error("Правок пока нет.");
  const answer = await post<{ ok?: boolean }>("/api/room-submit", { room: session.room, invite: session.invite, kind: "changes", from: { name: who, relation: "" }, changes });
  if (!answer.ok) throw new Error(answer.error || "Не получилось отправить.");
  saveSession({ ...session, base: lists() }); // следующая отправка покажет только новые правки
  return changes.length;
}

export const leaveHelper = () => saveSession(null);

/** Владелец: сверка присланных правок с книгой, какая она сейчас. */
export function reviewIncoming(changes: Change[]): ReviewItem[] {
  return reviewChanges(useRod.getState() as unknown as Book, changes);
}

export function applyIncoming(items: ReviewItem[], decisions: Record<string, Decision>, who: string): void {
  const patch = applyReview(useRod.getState() as unknown as Book, items, decisions, `от ${who}`);
  if (!Object.keys(patch).length) return;
  useRod.setState(patch as Record<string, unknown>);
  flushBook();
}

export { type Decision, type ReviewItem };
