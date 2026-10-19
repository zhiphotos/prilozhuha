import { API_BASE } from "@/lib/rod/config";
import { useRod } from "@/lib/rod/store";

const KEY = "kniga-push";
export type PushPrefs = { on: boolean; hour: number; days: number[] };
export const DEFAULT_PUSH: PushPrefs = { on: false, hour: 19, days: [2, 4, 0] };
export const DAY_CHOICES: { label: string; days: number[] }[] = [
  { label: "Три раза в неделю", days: [2, 4, 0] },
  { label: "Каждый день", days: [0, 1, 2, 3, 4, 5, 6] },
  { label: "Раз в неделю", days: [0] },
];

export function pushPrefs(): PushPrefs {
  try {
    return { ...DEFAULT_PUSH, ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<PushPrefs>) };
  } catch {
    return DEFAULT_PUSH;
  }
}
const save = (prefs: PushPrefs) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* настройка не запомнится */
  }
};

const post = async <T,>(path: string, body: unknown): Promise<T & { error?: string }> => {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return (await response.json().catch(() => ({}))) as T & { error?: string };
};

const appAddress = () => `${window.location.origin}${window.location.pathname}`;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export type PushSupport = "ok" | "need-install" | "unsupported" | "denied" | "no-server";

/** Можно ли включить напоминания на этом устройстве. На iPhone они работают только у приложения, добавленного на экран «Домой». */
export function pushSupport(): PushSupport {
  if (!API_BASE) return "no-server";
  if (isIos() && !standalone()) return "need-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

export function stats() {
  const state = useRod.getState();
  return { people: state.people.length, pages: state.pages.length, lessonsDone: state.doneLessons.length, paid: state.programOpen };
}

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Включает напоминания: разрешение, подписка в браузере, запись на сервере. */
export async function enablePush(hour: number, days: number[]): Promise<void> {
  const config = await fetch(`${API_BASE}/api/push-config`).then((r) => r.json() as Promise<{ enabled?: boolean; publicKey?: string }>);
  if (!config.enabled || !config.publicKey) throw new Error("Напоминания пока не подключены.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешение не дано. Его можно включить в настройках телефона.");
  const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}push-sw.js`);
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) }));
  const answer = await post<{ ok?: boolean }>("/api/push-subscribe", { subscription: subscription.toJSON(), hour, days, offsetMin: -new Date().getTimezoneOffset(), app: appAddress(), stats: stats() });
  if (!answer.ok) throw new Error(answer.error || "Не получилось включить напоминания.");
  save({ on: true, hour, days });
}

export async function disablePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}push-sw.js`);
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await post("/api/push-unsubscribe", { endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
  } finally {
    save({ ...pushPrefs(), on: false });
  }
}

/** При запуске: сообщаем серверу, что человек зашёл (напоминание в этот день не нужно) и что у него в книге. */
export async function pingPush(): Promise<void> {
  if (!API_BASE || !pushPrefs().on || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration(`${import.meta.env.BASE_URL}push-sw.js`);
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await post("/api/push-ping", { endpoint: subscription.endpoint, stats: stats() });
  } catch {
    /* без связи не страшно */
  }
}
