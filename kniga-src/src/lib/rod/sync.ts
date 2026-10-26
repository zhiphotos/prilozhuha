import { create } from "zustand";
import { API_BASE } from "@/lib/rod/config";
import { DATA_KEYS, applyBookData, collectRefs } from "@/lib/rod/backup";
import { hasMedia, mediaDataUrl, saveMediaAs } from "@/lib/rod/media";
import { deviceId } from "@/lib/rod/pay";
import { decideSync, fingerprint, splitParts } from "@/lib/rod/sync-logic";
import { flushBook, useRod } from "@/lib/rod/store";

// Синхронизация книги между устройствами одного оплаченного доступа (до 3 устройств).
// Книга и фото хранятся в облаке; версия растёт на единицу при каждой загрузке. Если менялось и там, и здесь, решает человек.

const PART = 700_000;
const META = "kniga-sync";

type Meta = { rev: number; hash: string; at: string };

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
    return { rev: Number(raw?.rev ?? 0), hash: String(raw?.hash ?? ""), at: String(raw?.at ?? "") };
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
  const response = await fetch(`${API_BASE}/api/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, deviceId: deviceId(), ...body }) });
  const data = (await response.json().catch(() => ({ error: "Облако не ответило." }))) as T & { error?: string };
  return { status: response.status, data };
}

async function pack(text: string): Promise<string> {
  if (typeof CompressionStream === "undefined") return `r:${text}`;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return `g:${btoa(binary)}`;
}

async function unpack(packed: string): Promise<string> {
  if (packed.startsWith("r:")) return packed.slice(2);
  const binary = atob(packed.slice(2));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
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

async function upload(cloudRev: number): Promise<"ok" | "conflict"> {
  const snap = snapshot();
  await uploadMedia(snap.refs);
  const parts = splitParts(await pack(snap.text), PART);
  for (let i = 0; i < parts.length; i += 1) {
    const sent = await call<{ committed?: boolean; rev?: number }>({ op: "push", baseRev: cloudRev, parts: parts.length, i, data: parts[i] });
    if (sent.status === 409) return "conflict";
    if (sent.status !== 200) throw new Error(sent.data.error || "Книга не загрузилась.");
    if (sent.data.committed) writeMeta({ rev: sent.data.rev ?? cloudRev + 1, hash: snap.hash, at: new Date().toISOString() });
  }
  return "ok";
}

async function download(rev: number, parts: number) {
  let packed = "";
  for (let i = 0; i < parts; i += 1) {
    const got = await call<{ data?: string }>({ op: "part", rev, i });
    if (got.status !== 200 || got.data.data == null) throw new Error(got.data.error || "Книга не загрузилась из облака.");
    packed += got.data.data;
  }
  const data = JSON.parse(await unpack(packed)) as Record<string, unknown>;
  const refs = new Set<string>();
  collectRefs(data, refs);
  await downloadMedia([...refs]);
  applyBookData(data);
  const snap = snapshot();
  writeMeta({ rev, hash: snap.hash, at: new Date().toISOString() });
}

export type SyncMode = "auto" | "mine" | "cloud";

/** Одна синхронизация. auto: только безопасные случаи, при конфликте ждёт выбора. mine/cloud: выбор человека при конфликте. */
export async function syncNow(mode: SyncMode = "auto"): Promise<void> {
  const ui = useSync.getState();
  if (ui.busy || !API_BASE) return;
  const access = useRod.getState().access;
  if (!access?.token) return;
  ui.setState({ busy: true, message: "Синхронизирую…" });
  try {
    const head = await call<{ rev?: number; parts?: number }>({ op: "head" });
    if (head.status !== 200) throw new Error(head.data.error || "Облако не ответило.");
    const cloudRev = head.data.rev ?? 0;
    const meta = readMeta();
    const state = useRod.getState();
    const empty = !state.pages.length && !state.people.length && !state.photos.length && !state.stories.length;
    // Пустая книга на новом устройстве ничего не меняла: берём облако без вопросов.
    const dirty = meta.rev === 0 && empty ? false : snapshot().hash !== meta.hash;
    let todo = decideSync({ cloudRev, baseRev: meta.rev, dirty });
    if (todo === "conflict" && mode === "mine") todo = "upload";
    if (todo === "conflict" && mode === "cloud") todo = "download";
    if (todo === "conflict") {
      ui.setState({ busy: false, conflict: true, message: "Книга менялась и здесь, и на другом устройстве. Выберите, какую оставить." });
      return;
    }
    if (todo === "upload") {
      const result = await upload(cloudRev);
      if (result === "conflict") {
        ui.setState({ busy: false, conflict: true, message: "Пока я загружала, в облаке появилась новая версия. Выберите, какую оставить." });
        return;
      }
      ui.setState({ busy: false, conflict: false, message: "Книга загружена в облако." });
    } else if (todo === "download") {
      await download(cloudRev, head.data.parts ?? 1);
      ui.setState({ busy: false, conflict: false, message: "Взяла книгу из облака." });
    } else {
      writeMeta({ ...meta, at: new Date().toISOString() });
      ui.setState({ busy: false, conflict: false, message: "Всё актуально, версия одинаковая." });
    }
  } catch (error) {
    ui.setState({ busy: false, message: error instanceof Error ? error.message : "Не получилось синхронизировать." });
  }
}

let started = false;

/** Автосинхронизация: один раз при запуске и когда приложение уходит в фон (только загрузка своих правок). */
export function startAutoSync(): void {
  if (started || typeof document === "undefined") return;
  started = true;
  window.setTimeout(() => void syncNow("auto"), 4000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void syncNow("auto");
  });
}
