/**
 * Состояние обмена книгой с родственниками: чтобы владелец и помощник видели, что происходит, а ошибки не пропадали молча.
 * Здесь только решения и текст без сети и без браузера, их проверяют сценарии. Показывает состояние экран, пишет в него helper.ts.
 */
import type { Book } from "./helper-changes.ts";
import type { HelperResult } from "./helper-auto.ts";

/** Столько знаков JSON принимает сервер в «книгу для помощников» (kniga-api/lib/routes/room-base.js, MAX_BASE). */
export const MAX_BASE_CHARS = 2_500_000;

export type BaseSize = { size: number; limit: number; ok: boolean; percent: number };

/** Считает размер так же, как сервер: длина JSON. Нужен до отправки, чтобы слишком большая книга не пропадала молча. */
export function baseSize(base: Book): BaseSize {
  const size = JSON.stringify(base ?? {}).length;
  return { size, limit: MAX_BASE_CHARS, ok: size <= MAX_BASE_CHARS, percent: Math.round((size / MAX_BASE_CHARS) * 100) };
}

export const BASE_TOO_BIG = (check: BaseSize) =>
  `Книга для помощников не поместилась: ${check.percent}% от допустимого размера. Помощники пока видят прежнюю версию. Уберите лишние истории или страницы либо напишите нам, мы увеличим предел.`;

export type SyncState = "off" | "ok" | "waiting" | "error";
export type SyncStatus = { state: SyncState; text: string; at: number };

let current: SyncStatus = { state: "off", text: "", at: 0 };
const listeners = new Set<() => void>();

export const getSyncStatus = (): SyncStatus => current;

export function setSyncStatus(state: SyncState, text: string, at = Date.now()): void {
  if (current.state === state && current.text === text) return;
  current = { state, text, at };
  for (const listener of listeners) listener();
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const resetSyncStatus = () => setSyncStatus("off", "", 0);

export const OFFLINE_TEXT = "Нет связи с сервером. Отправлю, как только она появится";

/** Обрыв связи браузер называет по-английски («Failed to fetch», «Load failed», «NetworkError»): это не ошибка книги, а просто нет сети. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  const message = error instanceof Error ? error.message : "";
  return /failed to fetch|load failed|networkerror|network request failed/i.test(message);
}

/** Что показать после неудачи: нет сети – «ждёт» (повторится само), всё остальное – «не получилось» с причиной. */
export function failureStatus(error: unknown): { state: SyncState; text: string } {
  return isNetworkError(error) ? { state: "waiting", text: OFFLINE_TEXT } : { state: "error", text: errorText(error) };
}

/** Понятный текст ошибки: сеть и сервер говорят по-разному. */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message) return message;
  return "Не получилось связаться с сервером. Повторю сама.";
}

/** Что показать после одного обхода помощника. */
export function statusOfRound(result: HelperResult): { state: SyncState; text: string } | null {
  switch (result) {
    case "updated":
      return { state: "ok", text: "Получена свежая версия от владельца" };
    case "idle":
      return { state: "ok", text: "Всё получено, новых изменений нет" };
    case "waiting":
      return { state: "waiting", text: "Владелец ещё не разобрал ваши правки, новое от него придёт после этого" };
    case "no-who":
      return { state: "waiting", text: "Подпишитесь, и ваши правки уйдут владельцу" };
    case "skipped":
      return { state: "waiting", text: "Есть неотправленные правки, отправлю их при следующем обходе" };
    case "no-session":
      return null;
  }
}
