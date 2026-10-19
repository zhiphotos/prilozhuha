import { toast } from "sonner";
// Резервная копия: вся книга с фотографиями в одном файле .kniga – его можно переложить на другое устройство.
import { afterHydrate } from "@/lib/rod/boot";
import { flushBook, useRod } from "@/lib/rod/store";
import { isMediaRef, mediaDataUrl, saveMedia } from "@/lib/rod/media";

const DATA_KEYS = ["onboarded", "audience", "dedicatee", "collector", "people", "places", "photos", "stories", "events", "documents", "notes", "pages", "trash", "doneLessons", "print", "moodboard", "back", "spine", "fonts", "userStickers", "plan"] as const;

function collectRefs(value: unknown, into: Set<string>) {
  if (typeof value === "string") {
    if (isMediaRef(value)) into.add(value);
    return;
  }
  if (Array.isArray(value)) value.forEach((item) => collectRefs(item, into));
  else if (value && typeof value === "object") Object.values(value).forEach((item) => collectRefs(item, into));
}

function replaceRefs(value: unknown, map: Map<string, string>): unknown {
  if (typeof value === "string") return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((item) => replaceRefs(item, map));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replaceRefs(v, map)]));
  return value;
}

const LAST_KEY = "kniga-last-backup";

export function lastBackupAt(): Date | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? new Date(raw) : null;
  } catch {
    return null;
  }
}

/** Правили страницы после последней копии: пора напомнить, что книга живёт только на этом устройстве. */
export function changedSinceBackup(): boolean {
  const last = lastBackupAt()?.getTime() ?? 0;
  return useRod.getState().pages.some((page) => (page.editedAt ?? 0) > last);
}

/** Подсказка после работы: кнопка сразу собирает копию. */
export function remindBackup(): void {
  if (!changedSinceBackup()) return;
  toast("Книга хранится только на этом устройстве, ни в каком аккаунте. Сохраните копию после работы.", {
    duration: 14000,
    action: {
      label: "Сохранить копию",
      onClick: () =>
        void exportBook().then((mode) => {
          if (mode === "cancelled") return;
          toast(mode === "shared" ? "Копия готова: выберите «Сохранить в Файлы»" : "Копия сохранена в «Загрузки»");
        }).catch(() => toast("Копия не сохранилась")),
    },
  });
}

/** Собирает копию: вся книга и все фото одним файлом. На телефоне открывает «Поделиться» (там «Сохранить в Файлы»), на компьютере скачивает. */
export async function exportBook(): Promise<"shared" | "downloaded" | "cancelled"> {
  flushBook();
  const state = useRod.getState();
  const data = Object.fromEntries(DATA_KEYS.map((key) => [key, state[key]]));
  const refs = new Set<string>();
  collectRefs(data, refs);
  const media: Record<string, string> = {};
  for (const ref of refs) media[ref] = await mediaDataUrl(ref);
  const body = JSON.stringify({ app: "kniga-roda", version: 1, savedAt: new Date().toISOString(), data, media });
  const name = `Книга рода – копия ${new Date().toLocaleDateString("ru-RU")}.kniga`;
  const mark = () => {
    try {
      localStorage.setItem(LAST_KEY, new Date().toISOString());
    } catch {
      /* без отметки копия всё равно сохранена */
    }
  };
  const file = new File([body], name, { type: "application/json" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Книга рода" });
      mark();
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  mark();
  return "downloaded";
}

export async function importBook(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as { app?: string; data?: Record<string, unknown>; media?: Record<string, string> };
  if (parsed.app !== "kniga-roda" || !parsed.data) throw new Error("Это не копия Книги рода");
  const map = new Map<string, string>();
  for (const [ref, dataUrl] of Object.entries(parsed.media ?? {})) {
    if (dataUrl) map.set(ref, await saveMedia(dataUrl));
  }
  const data = replaceRefs(parsed.data, map) as Record<string, unknown>;
  const defaults: Record<string, unknown> = { back: null, spine: { text: "", font: "script", size: 0 }, fonts: [], userStickers: [], plan: [] };
  const clean = { ...defaults, ...Object.fromEntries(DATA_KEYS.filter((key) => key in data).map((key) => [key, data[key]])) };
  useRod.setState(clean);
  afterHydrate();
  flushBook();
}
