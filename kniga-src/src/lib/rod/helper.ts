import { API_BASE } from "@/lib/rod/config";
import { helperRoundWith, publishIfChangedWith, signature } from "@/lib/rod/helper-auto";
import { HELPER_KEYS, applyReview, makeChangeSet, reviewChanges, type Book, type Change, type Decision, type ReviewItem } from "@/lib/rod/helper-changes";
import { collectRefs } from "@/lib/rod/backup";
import { hasMedia, mediaDataUrl, saveMediaAs } from "@/lib/rod/media";
import { addProjectMeta, activeProjectId } from "@/lib/rod/projects";
import { switchBook } from "@/lib/rod/boot";
import { compressPhoto, createRoom } from "@/lib/rod/family";
import { flushBook, useRod } from "@/lib/rod/store";

type Auth = { room: string; ownerKey?: string; invite?: string };

const lists = (): Book => {
  const state = useRod.getState() as unknown as Record<string, unknown>;
  return Object.fromEntries(HELPER_KEYS.map((key) => [key, state[key] ?? []])) as Book;
};

const post = async <T,>(path: string, body: unknown): Promise<T & { error?: string }> => {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json().catch(() => ({ error: "Сервер не ответил." }))) as T & { error?: string };
};

const refsOf = (value: unknown) => {
  const set = new Set<string>();
  collectRefs(value, set);
  return set;
};

/** Фото уходят уменьшенными (до ~450 КБ), по несколько штук за раз. Ссылки на фото остаются теми же. */
async function uploadMedia(auth: Auth, refs: string[], progress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  for (let i = 0; i < refs.length; i += 4) {
    const put: Record<string, string> = {};
    for (const ref of refs.slice(i, i + 4)) {
      const full = await mediaDataUrl(ref);
      if (!full) continue;
      try {
        put[ref] = await compressPhoto(await (await fetch(full)).blob());
      } catch {
        /* фото не открылось: запись придёт без него */
      }
    }
    if (Object.keys(put).length) {
      const answer = await post<{ ok?: boolean }>("/api/room-media", { ...auth, put });
      if (!answer.ok) throw new Error(answer.error || "Не получилось отправить фото.");
    }
    done += 4;
    progress?.(Math.min(done, refs.length), refs.length);
  }
}

/** Забирает недостающие фото и кладёт их на это устройство под теми же ссылками. */
async function downloadMedia(auth: Auth, refs: string[]): Promise<void> {
  const missing: string[] = [];
  for (const ref of refs) if (!(await hasMedia(ref))) missing.push(ref);
  for (let i = 0; i < missing.length; i += 6) {
    const answer = await post<{ media?: Record<string, string> }>("/api/room-media", { ...auth, get: missing.slice(i, i + 6) });
    for (const [ref, data] of Object.entries(answer.media ?? {})) await saveMediaAs(ref, data);
  }
}

const PUB_KEY = "kniga-published";
type Published = { sig: string; media: string[] };
const readPublished = (): Published | null => {
  try {
    const raw = localStorage.getItem(PUB_KEY);
    return raw ? (JSON.parse(raw) as Published) : null;
  } catch {
    return null;
  }
};
/** Владелец: выложить текущую версию книги (люди, места, истории, заметки, страницы, фото), чтобы помощники взяли её за основу.
 *  С onlyNew выкладываются только ещё не отправленные фото: так работает автоматическая выкладка. Кнопка выкладывает всё. */
export async function publishBase(progress?: (done: number, total: number) => void, onlyNew = false): Promise<void> {
  if (!useRod.getState().room) await createRoom("Наша семья");
  const room = useRod.getState().room;
  if (!room) throw new Error("Не получилось создать ссылку.");
  const base = lists();
  const auth: Auth = { room: room.id, ownerKey: room.ownerKey };
  const known = new Set(onlyNew ? readPublished()?.media ?? [] : []);
  const refs = [...refsOf(base)];
  await uploadMedia(auth, refs.filter((ref) => !known.has(ref)), progress);
  const answer = await post<{ ok?: boolean }>("/api/room-base", { room: room.id, ownerKey: room.ownerKey, base });
  if (!answer.ok) throw new Error(answer.error || "Не получилось открыть книгу для правок.");
  try {
    localStorage.setItem(PUB_KEY, JSON.stringify({ sig: signature(base), media: refs } satisfies Published));
  } catch {
    /* без записи книга просто выложится ещё раз */
  }
}

const KEY = "kniga-helper";
export type HelperSession = { room: string; invite: string; name: string; base: Book; project: string; who?: string; baseAt?: number };

export function helperSession(): HelperSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    const session = raw ? (JSON.parse(raw) as HelperSession) : null;
    return session && session.project === activeProjectId() ? session : null;
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

export const rememberWho = (who: string) => {
  const session = helperSession();
  if (session) saveSession({ ...session, who });
};

/** Помощник: взять версию владельца. Если в этом браузере уже есть своя книга, копия открывается отдельной книгой, своя не затрагивается. */
export async function joinAsHelper(room: string, invite: string, progress?: (text: string) => void): Promise<void> {
  try {
    const raw = localStorage.getItem(KEY);
    const old = raw ? (JSON.parse(raw) as HelperSession) : null;
    if (old?.room === room) {
      if (old.project !== activeProjectId()) await switchBook(old.project);
      return;
    }
  } catch {
    /* продолжаем как новый помощник */
  }
  progress?.("Получаю книгу…");
  const answer = await post<{ ok?: boolean; base?: Book; name?: string; at?: number }>("/api/room-base", { room, invite });
  if (!answer.ok || !answer.base) throw new Error(answer.error || "Не получилось открыть книгу.");
  const auth: Auth = { room, invite };
  progress?.("Получаю фото…");
  await downloadMedia(auth, [...refsOf(answer.base)]);
  const seed: Record<string, unknown> = { onboarded: true, audience: "family", dedicatee: "", collector: "" };
  for (const key of HELPER_KEYS) seed[key] = answer.base[key] ?? [];
  const state = useRod.getState();
  const hasOwn = state.people.length || state.pages.length || state.stories.length;
  let project = activeProjectId();
  if (hasOwn) {
    project = addProjectMeta(`Помощник: ${answer.name ?? "Семья"}`).id;
    await switchBook(project, seed as Parameters<typeof switchBook>[1]);
  } else {
    useRod.setState(seed);
    flushBook();
  }
  saveSession({ room, invite, name: answer.name ?? "Семья", base: answer.base, project, baseAt: answer.at });
}

export const helperChanges = (session: HelperSession): Change[] => makeChangeSet(session.base, lists());

export async function sendChanges(session: HelperSession, who: string, progress?: (done: number, total: number) => void): Promise<number> {
  const changes = helperChanges(session);
  if (!changes.length) throw new Error("Правок пока нет.");
  const known = refsOf(session.base);
  const fresh = [...refsOf(changes.map((c) => c.after))].filter((ref) => !known.has(ref));
  await uploadMedia({ room: session.room, invite: session.invite }, fresh, progress);
  const answer = await post<{ ok?: boolean }>("/api/room-submit", { room: session.room, invite: session.invite, kind: "changes", from: { name: who, relation: "" }, changes });
  if (!answer.ok) throw new Error(answer.error || "Не получилось отправить.");
  saveSession({ ...session, who, base: lists() }); // следующая отправка покажет только новые правки
  return changes.length;
}

export const leaveHelper = () => saveSession(null);

/** Владелец: если книга изменилась с последней выкладки, выложить её заново (только для тех, кто уже открывал книгу для правок). */
const publishIfChanged = () =>
  publishIfChangedWith({
    hasRoom: () => Boolean(useRod.getState().room?.ownerKey),
    lastSignature: () => readPublished()?.sig ?? null,
    lists,
    publish: () => publishBase(undefined, true),
  });

/** Помощник: отправить свои правки (если уже подписался) и забрать свежую версию владельца, когда у него нет ничего неотправленного. */
const helperRound = () =>
  helperRoundWith<HelperSession>({
    session: helperSession,
    saveSession,
    lists,
    setLists: (patch) => {
      useRod.setState(patch);
      flushBook();
    },
    send: async (session, who) => {
      await sendChanges(session, who);
    },
    poll: (session) => post("/api/room-base", { room: session.room, invite: session.invite, since: session.baseAt ?? 0, who: session.who ?? "" }),
    downloadMedia: (session, base) => downloadMedia({ room: session.room, invite: session.invite }, [...refsOf(base)]),
  });

let helperSyncStarted = false;
let helperSyncBusy = false;

/** Автоматический обмен с родственниками: при запуске, при возврате в приложение, при появлении сети, раз в две минуты и через 30 секунд после правок. */
export function startHelperSync(): void {
  if (helperSyncStarted || typeof document === "undefined") return;
  helperSyncStarted = true;
  const run = () => {
    if (helperSyncBusy || navigator.onLine === false) return;
    helperSyncBusy = true;
    void publishIfChanged()
      .catch(() => undefined)
      .then(() => helperRound())
      .catch(() => undefined)
      .finally(() => {
        helperSyncBusy = false;
      });
  };
  window.setTimeout(run, 8000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") run();
  });
  window.addEventListener("online", run);
  window.setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, 120_000);
  let timer: number | undefined;
  useRod.subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 30_000);
  });
}

/** Владелец: забрать фото из присланных правок и сверить правки с книгой, какая она сейчас. */
export async function reviewIncoming(changes: Change[]): Promise<ReviewItem[]> {
  const room = useRod.getState().room;
  if (room) await downloadMedia({ room: room.id, ownerKey: room.ownerKey }, [...refsOf(changes.map((c) => c.after))]);
  return reviewChanges(useRod.getState() as unknown as Book, changes);
}

export function applyIncoming(items: ReviewItem[], decisions: Record<string, Decision>, who: string): void {
  const patch = applyReview(useRod.getState() as unknown as Book, items, decisions, `от ${who}`);
  if (!Object.keys(patch).length) return;
  useRod.setState(patch as Record<string, unknown>);
  flushBook();
}

export { type Decision, type ReviewItem };
