// Клиент ИИ-слоя. Все лимиты и проверки доступа выполняет сервер (kniga-api/lib/ai); здесь только вызовы и понятные тексты.
// Зависимости (адрес, токен, устройство, fetch) передаются снаружи: так модуль проверяется тестами без браузера.

export type AiKind = "text" | "audio_min" | "ocr_pages" | "archive";
export type AiQuota = { per: "day" | "month"; limit: number; used: number; left: number; resetAt: string };
export type AiStatus = { enabled: boolean; available: Record<AiKind, boolean>; usage: Record<AiKind, AiQuota> };
export type AiDeps = { apiBase: string; token: string; deviceId: string; fetch?: typeof fetch };
export type AiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string; resetAt?: string };

async function post<T>(deps: AiDeps, path: string, body: Record<string, unknown>): Promise<AiResult<T>> {
  if (!deps.apiBase || !deps.token) return { ok: false, status: 0, code: "no_access", message: "ИИ доступен после входа в программу." };
  try {
    const response = await (deps.fetch ?? fetch)(`${deps.apiBase}/api/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: deps.token, deviceId: deps.deviceId, ...body }) });
    const data = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string; resetAt?: string };
    if (response.ok) return { ok: true, data };
    return { ok: false, status: response.status, code: data.code ?? "error", message: data.error ?? "ИИ сейчас не отвечает.", resetAt: data.resetAt };
  } catch {
    return { ok: false, status: 0, code: "network", message: "Нет связи с сервером. Результаты не потеряны, попробуйте позже." };
  }
}

export const aiStatus = (deps: AiDeps) => post<AiStatus>(deps, "ai-status", {});

/** Вопрос ИИ-генеалогу. context – краткое описание дерева (собирается из книги), ответ сервер строит только по нему. */
export const askGenealogist = (deps: AiDeps, question: string, context: string, requestId: string) => post<{ text: string; left: number; resetAt: string }>(deps, "ai-run", { task: "genealogy_ask", requestId, input: { question, context } });

/** «Осталось 12 из 20 до 4 ноября». */
export function quotaLine(quota: AiQuota, now = new Date()): string {
  const reset = new Date(quota.resetAt);
  const date = reset.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
  return `Осталось ${quota.left} из ${quota.limit}. Обновится ${reset.getTime() - now.getTime() < 36 * 3600000 ? "завтра" : date}.`;
}
