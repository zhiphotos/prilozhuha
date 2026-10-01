// Резервная копия: вся книга с фотографиями в одном файле .kniga — его можно переложить на другое устройство.
import { flushBook, useRod } from "@/lib/rod/store";
import { isMediaRef, mediaDataUrl, saveMedia } from "@/lib/rod/media";

const DATA_KEYS = ["onboarded", "audience", "dedicatee", "collector", "people", "places", "photos", "stories", "events", "documents", "notes", "pages", "trash", "programOpen", "doneLessons"] as const;

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

export async function exportBook(): Promise<void> {
  flushBook();
  const state = useRod.getState();
  const data = Object.fromEntries(DATA_KEYS.map((key) => [key, state[key]]));
  const refs = new Set<string>();
  collectRefs(data, refs);
  const media: Record<string, string> = {};
  for (const ref of refs) media[ref] = await mediaDataUrl(ref);
  const blob = new Blob([JSON.stringify({ app: "kniga-roda", version: 1, savedAt: new Date().toISOString(), data, media })], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Книга рода — копия ${new Date().toLocaleDateString("ru-RU")}.kniga`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function importBook(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as { app?: string; data?: Record<string, unknown>; media?: Record<string, string> };
  if (parsed.app !== "kniga-roda" || !parsed.data) throw new Error("Это не копия Книги рода");
  const map = new Map<string, string>();
  for (const [ref, dataUrl] of Object.entries(parsed.media ?? {})) {
    if (dataUrl) map.set(ref, await saveMedia(dataUrl));
  }
  const data = replaceRefs(parsed.data, map) as Record<string, unknown>;
  const clean = Object.fromEntries(DATA_KEYS.filter((key) => key in data).map((key) => [key, data[key]]));
  useRod.setState(clean);
  flushBook();
}
