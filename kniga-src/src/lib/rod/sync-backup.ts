import { STATE_STORE, idbDelete, idbGet, idbKeys, idbSet } from "@/lib/rod/idb";
import { pruneKeys } from "@/lib/rod/sync-logic";

// Резервные копии книги на этом устройстве: делаются перед заменой книги (облаком, копией из файла, восстановлением).
// Хранятся в IndexedDB рядом с книгой, последние пять. Фото лежат отдельно и от замены не страдают.

const PREFIX = "kniga-backup:";
const KEEP = 5;

export type BackupInfo = { key: string; label: string; at: string; people: number; pages: number };
type Stored = { label: string; at: string; text: string };

export async function saveBackup(label: string, text: string, protect?: string): Promise<string> {
  try {
    const key = `${PREFIX}${Date.now()}`;
    await idbSet(STATE_STORE, key, { label, at: new Date().toISOString(), text } satisfies Stored);
    const keys = (await idbKeys(STATE_STORE)).filter((k) => k.startsWith(PREFIX));
    for (const old of pruneKeys(keys, KEEP, protect)) await idbDelete(STATE_STORE, old);
    return key;
  } catch {
    /* без хранилища резервной копии замена всё равно не должна ломаться, но человек об этом узнает из сообщения синхронизации */
    throw new Error("Не получилось сохранить резервную копию на этом устройстве.");
  }
}

export async function listBackups(): Promise<BackupInfo[]> {
  const keys = (await idbKeys(STATE_STORE)).filter((k) => k.startsWith(PREFIX)).sort().reverse();
  const out: BackupInfo[] = [];
  for (const key of keys) {
    const stored = await idbGet<Stored>(STATE_STORE, key);
    if (!stored) continue;
    let people = 0;
    let pages = 0;
    try {
      const data = JSON.parse(stored.text) as { people?: unknown[]; pages?: unknown[] };
      people = data.people?.length ?? 0;
      pages = data.pages?.length ?? 0;
    } catch {
      /* повреждённую копию всё равно показываем */
    }
    out.push({ key, label: stored.label, at: stored.at, people, pages });
  }
  return out;
}

export async function readBackup(key: string): Promise<Record<string, unknown> | null> {
  const stored = await idbGet<Stored>(STATE_STORE, key);
  if (!stored) return null;
  try {
    return JSON.parse(stored.text) as Record<string, unknown>;
  } catch {
    return null;
  }
}
