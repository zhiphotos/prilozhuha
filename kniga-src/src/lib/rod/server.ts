import { API_BASE } from "@/lib/rod/config";

export type ServerStatus = { pay: boolean; push: boolean; rooms: boolean; ai: boolean };
const OFF: ServerStatus = { pay: false, push: false, rooms: false, ai: false };

let cached: Promise<ServerStatus> | null = null;

/** Что на сервере уже подключено. Без сервера или без связи всё считается выключенным, и приложение показывает «скоро». */
export function serverStatus(): Promise<ServerStatus> {
  if (!API_BASE) return Promise.resolve(OFF);
  cached ??= fetch(`${API_BASE}/api/status`)
    .then((r) => r.json() as Promise<Partial<ServerStatus>>)
    .then((s) => ({ ...OFF, ...s }))
    .catch(() => {
      cached = null;
      return OFF;
    });
  return cached;
}
