// Клиент ИИ-слоя. Все лимиты и проверки доступа выполняет сервер (kniga-api/lib/ai); здесь только вызовы и понятные тексты.
// Зависимости (адрес, токен, устройство, fetch) передаются снаружи: так модуль проверяется тестами без браузера.

export type AiKind = "text" | "facts" | "audio_min" | "ocr_pages" | "archive" | "chat" | "chapter";
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

/** Расшифровка одного куска записи (WAV, base64, до 90 секунд). Сервер сам считает минуты и возвращает их при сбое. */
export const transcribeChunk = (deps: AiDeps, audio: string, seconds: number, requestId: string, prompt?: string) =>
  post<{ text: string; segments: { start: number; end: number; text: string }[]; left: number; resetAt: string }>(deps, "ai-transcribe", { audio, seconds, requestId, language: "ru", prompt });

/** Факты из куска расшифровки интервью (до ~9000 знаков). Сервер сам проверяет цитаты и отбрасывает выдуманное; считается отдельным счётчиком, минуты расшифровки не тратятся. */
export type RawFact = { kind: string; title: string; detail?: string; relation?: string; years?: string; place?: string; quote: string; certainty?: string; note?: string };
export const extractFactsChunk = (deps: AiDeps, text: string, requestId: string, context?: string) =>
  post<{ facts: RawFact[]; dropped: number; left: number; resetAt: string }>(deps, "ai-facts", { text, requestId, context: context?.trim() || undefined });

/** Чат с ИИ-генеалогом: история диалога и вопрос; сервер добавляет инструкцию и базу знаний. */
export type ChatMsg = { role: "user" | "assistant"; text: string };
export const chatGenealogist = (deps: AiDeps, messages: ChatMsg[], requestId: string) => post<{ reply: string; sources: string[]; left: number; resetAt: string }>(deps, "ai-chat", { messages, requestId });

/** Художественная глава по присланному рассказу: стиль выбирает человек, инструкции живут на сервере. */
export type ChapterStyle = "family" | "classic" | "memoir" | "essay" | "skaz" | "interview";
export const writeChapter = (deps: AiDeps, input: { text: string; style: ChapterStyle; wish: string }, requestId: string) => post<{ chapter: string; left: number; resetAt: string }>(deps, "ai-chapter", { ...input, requestId });

/** Поиск по архивам с ИИ: сервер выбирает и расставляет архивы из присланного списка и добавляет советы по методике. */
export type SeekLead = { id: string; title: string; archive: string; href: string; query: string; why: string; grade: "A" | "B" | "C"; seen: boolean };
export type SeekInput = { question: string; variants: string[]; place: string; seek: string; leads: SeekLead[] };
export const seekArchives = (deps: AiDeps, input: SeekInput, requestId: string) => post<{ summary: string; leads: SeekLead[]; tips: string[]; sources: string[]; left: number; resetAt: string }>(deps, "ai-seek", { ...input, requestId });

/** «Осталось 12 из 20 до 4 ноября». */
export function quotaLine(quota: AiQuota, now = new Date()): string {
  const reset = new Date(quota.resetAt);
  const date = reset.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
  return `Осталось ${quota.left} из ${quota.limit}. Обновится ${reset.getTime() - now.getTime() < 36 * 3600000 ? "завтра" : date}.`;
}
