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
