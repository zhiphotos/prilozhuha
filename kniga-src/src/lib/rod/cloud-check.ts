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
