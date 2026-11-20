import type { SyncOutcome } from "./sync-engine.ts";
import type { CloudCheck } from "../tree/second-parent.ts";

/**
 * Проверка облака перед правкой связей родства. Только получает актуальное состояние (обычная безопасная синхронизация),
 * ничего не выбирает и не заменяет сама. no-cloud: вход не выполнен или сервера нет, облачной копии нет.
 * Недоступное облако у вошедшего пользователя НЕ считается отсутствием копии: это failed, timeout, conflict или busy.
 */
export async function cloudCheckFrom(run: () => Promise<SyncOutcome>, isBusy: () => boolean, timeoutMs = 12000): Promise<CloudCheck> {
  const started = Date.now();
  while (isBusy()) {
    if (Date.now() - started > timeoutMs) return "busy";
    await new Promise((r) => setTimeout(r, 150));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), Math.max(500, timeoutMs - (Date.now() - started)));
  });
  const done: Promise<SyncOutcome> = run().catch((error) => ({ kind: "error", message: error instanceof Error ? error.message : "Не получилось проверить облако." }) as SyncOutcome);
  const result = await Promise.race([done, timeout]);
  if (timer) clearTimeout(timer);
  if (result === "timeout") return "timeout";
  if (result.kind === "conflict") return "conflict";
  if (result.kind === "error") return "failed";
  return "checked";
}

/** Что известно локально о синхронизации этой книги. unknown: достоверно определить нельзя. */
export type CloudHistory = "never" | "synced" | "unknown";

/**
 * Была ли эта книга когда-либо в облаке, по локальным отметкам: отметка синхронизации (localStorage) и база последней
 * синхронизации (IndexedDB). Выход из аккаунта эти отметки не стирает. «Не было» ставится только когда обе отметки
 * пусты И есть явный признак isLocalOnly (книга создана на этом устройстве, синхронизации не было). Нечитаемая, испорченная или пустая-но-существующая отметка даёт unknown, а не «не было».
 */
export async function cloudHistoryFrom(readMetaRaw: () => string | null, readBase: () => Promise<string | null | undefined>, isLocalOnly: () => boolean = () => false): Promise<CloudHistory> {
  try {
    const raw = readMetaRaw();
    if (raw !== null) {
      const meta = JSON.parse(raw) as { rev?: unknown; hash?: unknown; at?: unknown } | null;
      if (Number(meta?.rev ?? 0) > 0 || (typeof meta?.at === "string" && meta.at) || (typeof meta?.hash === "string" && meta.hash)) return "synced";
    }
    const base = await readBase();
    if (base) return "synced";
    // Пустые отметки сами по себе ничего не доказывают: их мог стереть браузер. «Не было» только если есть явный признак,
    // что книга создана здесь и ни разу не синхронизировалась (его не восстановить, если отметки стёрты уже после синхронизации).
    return raw === null && isLocalOnly() ? "never" : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Итог проверки облака. Вошёл (authorized): настоящая синхронизация. Не вошёл: решает история книги.
 * Недоступное облако у вошедшего и «раньше синхронизировалась» у вышедшего НЕ считаются отсутствием облачной копии.
 */
export async function cloudCheckFor(input: { authorized: boolean; history: () => Promise<CloudHistory>; run: () => Promise<SyncOutcome>; isBusy: () => boolean; timeoutMs?: number }): Promise<CloudCheck> {
  if (input.authorized) return cloudCheckFrom(input.run, input.isBusy, input.timeoutMs);
  let history: CloudHistory;
  try {
    history = await input.history();
  } catch {
    history = "unknown";
  }
  return history === "never" ? "no-cloud" : history === "synced" ? "signed-out" : "unknown";
}
