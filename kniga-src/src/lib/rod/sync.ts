import { toast } from "sonner";
import { create } from "zustand";
import { API_BASE } from "@/lib/rod/config";
import { DATA_KEYS, applyBookData, collectRefs } from "@/lib/rod/backup";
import { hasMedia, mediaDataUrl, saveMediaAs } from "@/lib/rod/media";
import { deviceId } from "@/lib/rod/pay";
import { fingerprint, splitParts } from "@/lib/rod/sync-logic";
import { PART, afterOpenCopy, previewMerge, restoreLocalBackup, restorePreviousCloud, syncCore, type Deps, type Meta, type SyncMode, type SyncOutcome } from "@/lib/rod/sync-engine";
import { readBackup, saveBackup } from "@/lib/rod/sync-backup";
import { flushBook, useRod } from "@/lib/rod/store";

// Синхронизация книги между устройствами одного оплаченного доступа (до 3 устройств).
// Книга и фото хранятся в облаке; версия растёт на единицу при каждой загрузке. Если менялось и там, и здесь, решает человек.

const META = "kniga-sync";


export type SyncState = {
  busy: boolean;
  conflict: boolean;
  message: string;
  at: string;
  setState: (patch: Partial<Omit<SyncState, "setState">>) => void;
};

export const useSync = create<SyncState>((set) => ({
  busy: false,
  conflict: false,
  message: "",
  at: readMeta().at,
  setState: (patch) => set(patch),
}));

function readMeta(): Meta {
  try {
    const raw = JSON.parse(localStorage.getItem(META) ?? "null") as Partial<Meta> | null;
    return { rev: Number(raw?.rev ?? 0), hash: String(raw?.hash ?? ""), at: String(raw?.at ?? ""), size: typeof raw?.size === "number" ? raw.size : undefined };
  } catch {
    return { rev: 0, hash: "", at: "" };
  }
}

function writeMeta(meta: Meta) {
  try {
    localStorage.setItem(META, JSON.stringify(meta));
  } catch {
    /* без отметки следующая синхронизация покажет конфликт, но ничего не потеряет */
  }
  useSync.getState().setState({ at: meta.at });
}

async function call<T>(body: Record<string, unknown>): Promise<{ status: number; data: T & { error?: string } }> {
  const token = useRod.getState().access?.token ?? "";
  // Фото уходят и приходят кусками, поэтому одиночный сбой связи на телефоне не должен обрывать всю синхронизацию: такие запросы безопасно повторить.
  const repeatable = typeof body.op === "string" && body.op.startsWith("media-");
  const attempts = repeatable ? 4 : 1;
  let last: { status: number; data: T & { error?: string } } = { status: 0, data: { error: "Облако не ответило." } as T & { error?: string } };
  for (let n = 0; n < attempts; n += 1) {
    if (n > 0) await new Promise((resolve) => setTimeout(resolve, 600 * n));
    try {
      const response = await fetch(`${API_BASE}/api/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, deviceId: deviceId(), ...body }) });
      const parsed = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
      if (parsed) return { status: response.status, data: parsed };
      last = { status: response.status, data: { error: `Облако не ответило (код ${response.status || "нет связи"}).` } as T & { error?: string } };
    } catch {
      last = { status: 0, data: { error: "Нет связи с облаком: проверьте интернет и попробуйте ещё раз." } as T & { error?: string } };
      if (!repeatable) throw new Error(last.data.error);
    }
  }
  return last;
}

function snapshot() {
  flushBook();
  const state = useRod.getState();
  const data = Object.fromEntries(DATA_KEYS.map((key) => [key, state[key]]));
  const text = JSON.stringify(data);
  const refs = new Set<string>();
  collectRefs(data, refs);
  return { text, hash: fingerprint(text), refs: [...refs] };
}

async function uploadMedia(refs: string[]) {
  if (!refs.length) return;
  const { data } = await call<{ missing?: string[] }>({ op: "media-has", refs });
  for (const ref of data.missing ?? []) {
    if (!(await hasMedia(ref))) continue;
    const chunks = splitParts(await mediaDataUrl(ref), PART);
    for (let i = 0; i < chunks.length; i += 1) {
      const sent = await call({ op: "media-put", ref, n: chunks.length, i, data: chunks[i] });
      if (sent.status !== 200) throw new Error(sent.data.error || "Фото не загрузилось.");
    }
  }
}

async function downloadMedia(refs: string[]) {
  for (const ref of refs) {
    if (await hasMedia(ref)) continue;
    let text = "";
    let n = 1;
    for (let i = 0; i < n; i += 1) {
      const got = await call<{ data?: string; n?: number }>({ op: "media-get", ref, i });
      if (got.status !== 200 || got.data.data == null) {
        text = "";
        break;
      }
      text += got.data.data;
      n = got.data.n ?? 1;
    }
    if (text) await saveMediaAs(ref, text);
  }
}

/** Версия принята облаком, только если сервер подтвердил «committed» и потом показал ту же версию и тот же отпечаток. */
function makeDeps(): Deps {
  return {
    call: (body) => call<Record<string, unknown>>(body),
    snapshot,
    readMeta,
    writeMeta,
    isEmpty: () => {
      const state = useRod.getState();
      return !state.pages.length && !state.people.length && !state.photos.length && !state.stories.length;
    },
    uploadMedia,
    downloadMedia,
    collectRefs: (data) => {
      const refs = new Set<string>();
      collectRefs(data, refs);
      return [...refs];
    },
    applyBook: applyBookData,
    saveBackup,
    readBackup,
    now: () => new Date().toISOString(),
  };
}

export type { SyncMode };

const MESSAGES = {
  uploaded: "Книга загружена в облако.",
  downloaded: "Взяла книгу из облака.",
  same: "Всё актуально, версия одинаковая.",
} as const;

/** Показывает человеку итог синхронизации. */
function report(outcome: SyncOutcome, mode: SyncMode) {
  const ui = useSync.getState();
  if (outcome.kind === "conflict") {
    const message = outcome.reason === "shrunk" ? "Книга на этом устройстве стала намного меньше облачной (возможно, часть данных пропала). Облако не тронуто. Лучше взять облачную книгу или объединить, а «оставить мою» выбирайте, только если удаляли это сами." : outcome.reason === "cloud-moved" ? "Пока я загружала, в облаке появилась новая версия. Выберите, какую оставить." : "Книга менялась и здесь, и на другом устройстве. Выберите, какую оставить.";
    // Окно показываем один раз, когда конфликт возник, а не при каждой проверке (раз в две минуты и при каждом возврате в приложение).
    const alreadyTold = ui.conflict;
    ui.setState({ busy: false, conflict: true, message });
    if (mode === "auto" && !alreadyTold && outcome.reason === "shrunk") toast("Книга на этом устройстве стала намного меньше облачной. Облако не тронуто: откройте «Главная» → «Книга на ваших устройствах» и выберите, какую оставить.");
    else if (mode === "auto" && !alreadyTold) toast("Книга менялась и здесь, и на другом устройстве. Откройте «Главная» → «Книга на ваших устройствах» и выберите, какую оставить. Если книга открыта на двух устройствах, выбрать нужно на каждом.", { id: "sync-conflict", duration: 20000 });
  } else if (outcome.kind === "error") {
    ui.setState({ busy: false, message: outcome.message });
  } else if (outcome.kind === "merged") {
    const { added, differing } = outcome.report.total;
    const kept = differing ? ` Записей с разным содержимым: ${differing}. Оставлены версии с этого устройства, облачные лежат в копиях.` : "";
    ui.setState({ busy: false, conflict: false, message: `Книги объединены: из облака добавлено записей: ${added}.${kept} Удалённое на одном устройстве, но оставшееся на другом, вернулось. Обе прежние версии сохранены копиями на этом устройстве. Если книга открыта на других устройствах, нажмите «Синхронизировать сейчас» и там: они возьмут объединённую.` });
  } else {
    ui.setState({ busy: false, conflict: false, message: MESSAGES[outcome.kind] });
  }
}

/** Что даст «Объединить»: числа для подтверждения. Ничего не меняет. */
export async function previewMergeNow() {
  return previewMerge(makeDeps());
}

/** Одна синхронизация. auto: только безопасные случаи, при конфликте ждёт выбора. mine/cloud: выбор человека при конфликте. */
export async function syncNow(mode: SyncMode = "auto"): Promise<void> {
  const ui = useSync.getState();
  if (ui.busy || !API_BASE || !useRod.getState().access?.token) return;
  ui.setState({ busy: true, message: "Синхронизирую…" });
  report(await syncCore(makeDeps(), mode), mode);
}

/** Копия книги на этом устройстве до замены. Вызывать перед «Открыть копию» и перед восстановлением. */
export async function backupLocalNow(label: string): Promise<string> {
  return saveBackup(label, snapshot().text);
}

/** Вернуть книгу из резервной копии на этом устройстве. */
export async function restoreBackup(key: string): Promise<boolean> {
  return restoreLocalBackup(makeDeps(), key);
}

/** После «Открыть копию»: см. afterOpenCopy. */
export async function markImportedCopy(): Promise<void> {
  if (!API_BASE || !useRod.getState().access?.token) return;
  report(await afterOpenCopy(makeDeps()), "auto");
}

/** Вернуть предыдущую облачную версию. */
export async function restorePreviousCloudVersion(): Promise<void> {
  if (!API_BASE || !useRod.getState().access?.token) return;
  useSync.getState().setState({ busy: true, message: "Возвращаю предыдущую облачную версию…" });
  report(await restorePreviousCloud(makeDeps()), "auto");
}

let started = false;

/** Автосинхронизация: при запуске, при возврате в приложение, раз в две минуты, при появлении сети и через 20 секунд после правок. */
export function startAutoSync(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  const run = () => void syncNow("auto");
  window.setTimeout(run, 4000);
  document.addEventListener("visibilitychange", run);
  window.addEventListener("online", run);
  window.setInterval(() => {
    if (document.visibilityState === "visible") run();
  }, 120_000);
  let timer: number | undefined;
  useRod.subscribe(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(run, 20_000);
  });
}
