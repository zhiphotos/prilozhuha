/** Что делать при синхронизации: сравниваем версию в облаке, версию, с которой мы начинали, и изменения на этом устройстве. */
export type SyncDecision = "upload" | "download" | "same" | "conflict";

export function decideSync(input: { cloudRev: number; baseRev: number; dirty: boolean }): SyncDecision {
  const { cloudRev, baseRev, dirty } = input;
  if (cloudRev === 0) return "upload"; // в облаке пусто: загружаем то, что есть
  const cloudChanged = cloudRev !== baseRev;
  if (!cloudChanged && !dirty) return "same";
  if (!cloudChanged && dirty) return "upload";
  if (cloudChanged && !dirty) return "download";
  return "conflict"; // менялось и там, и здесь: решает человек
}

/** Режет строку на куски не длиннее size. */
export function splitParts(text: string, size: number): string[] {
  if (!text) return [""];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** Быстрая «отпечаток» строки, чтобы понять, менялась ли книга (не для защиты). */
export function fingerprint(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

/** «Открыть копию» при включённой синхронизации: копию отправляем в облако сами только если в облаке нет ничего, чего это устройство не видело. Иначе решает человек. */
export function decideOpenCopy(input: { cloudRev: number; baseRev: number }): "upload" | "conflict" {
  const { cloudRev, baseRev } = input;
  return cloudRev === 0 || cloudRev === baseRev ? "upload" : "conflict";
}

/** Какие резервные копии удалить, чтобы осталось не больше keep. Удаляются самые старые; восстанавливаемая копия (protect) не удаляется никогда. */
export function pruneKeys(keys: string[], keep: number, protect?: string): string[] {
  const sorted = [...keys].sort();
  const extra = sorted.length - Math.max(1, keep);
  const out: string[] = [];
  for (const key of sorted) {
    if (out.length >= extra) break;
    if (key === protect) continue;
    out.push(key);
  }
  return out;
}
