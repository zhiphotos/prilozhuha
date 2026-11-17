// Адаптеры моделей. Единый интерфейс:
//   { name, kinds:[...], configured(env):boolean, run(task, env):Promise<{ text }> }
// Ошибка квоты провайдера должна бросаться как QuotaError, остальные как обычные Error.
// Платного резервного провайдера нет и быть не должно без решения владельца: engine берёт ровно один адаптер на вид работы.
export class QuotaError extends Error {}

const CF = "https://api.cloudflare.com/client/v4/accounts";

export const cloudflareText = {
  name: "cloudflare-text",
  kinds: ["text", "facts"],
  configured: (env = process.env) => Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
  async run({ system, user, maxTokens }, env = process.env) {
    const model = env.CF_TEXT_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    const r = await fetch(`${CF}/${env.CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens || 700, temperature: maxTokens ? 0.1 : undefined }),
      signal: AbortSignal.timeout(40000),
    });
    const data = await r.json().catch(() => ({}));
    // 4006: дневная бесплатная квота Neurons закончилась; 429: слишком часто. И то и другое: остановиться, не платить.
    if (r.status === 429 || (data.errors ?? []).some((e) => e.code === 4006)) throw new QuotaError("provider quota");
    if (!r.ok || !data.success) throw new Error(`provider ${r.status}`);
    return { text: String(data.result?.response ?? "").trim() };
  },
};

/** Whisper у Cloudflare (бесплатный запас 10 000 Neurons в сутки на весь аккаунт, около 46,6 Neurons за минуту звука). Принимает кусок звука (WAV, base64) и возвращает текст с отметками времени. */
export const cloudflareWhisper = {
  name: "cloudflare-whisper",
  kinds: ["audio_min"],
  configured: (env = process.env) => Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
  async run({ audio, language, prompt }, env = process.env) {
    const model = env.CF_WHISPER_MODEL || "@cf/openai/whisper-large-v3-turbo";
    const r = await fetch(`${CF}/${env.CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      // condition_on_previous_text выключен и vad включён против «зацикливания» и выдуманных повторов на тишине.
      body: JSON.stringify({ audio, task: "transcribe", language: language || "ru", vad_filter: true, condition_on_previous_text: false, initial_prompt: prompt ? String(prompt).slice(0, 400) : undefined }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 || (data.errors ?? []).some((e) => e.code === 4006)) throw new QuotaError("provider quota");
    if (!r.ok || !data.success) throw new Error(`provider ${r.status}`);
    const segments = (data.result?.segments ?? []).map((s) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text ?? "").trim() })).filter((s) => s.text);
    return { text: String(data.result?.text ?? "").trim(), segments };
  },
};


/** Чат-генеалог. Gemini, если задан ключ (в России напрямую недоступен: нужен GEMINI_BASE, адрес прокси на Cloudflare), иначе большая модель Cloudflare. */
const roleOf = (m) => (m.role === "assistant" ? "assistant" : "user");
export const cloudflareChat = {
  name: "cloudflare-chat",
  kinds: ["chat"],
  configured: (env = process.env) => Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
  async run({ system, messages, maxTokens }, env = process.env) {
    const model = env.CF_CHAT_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
    const r = await fetch(`${CF}/${env.CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: system }, ...messages.map((m) => ({ role: roleOf(m), content: m.text }))], max_tokens: maxTokens || 1200, temperature: 0.3 }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 || (data.errors ?? []).some((e) => e.code === 4006)) throw new QuotaError("provider quota");
    if (!r.ok || !data.success) throw new Error(`provider ${r.status}`);
    return { text: String(data.result?.response ?? "").trim() };
  },
};
export const geminiChat = {
  name: "gemini-chat",
  kinds: ["chat"],
  configured: (env = process.env) => Boolean(env.GEMINI_API_KEY),
  async run({ system, messages, maxTokens }, env = process.env) {
    const base = (env.GEMINI_BASE || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
    const model = env.GEMINI_MODEL || "gemini-2.5-flash";
    const r = await fetch(`${base}/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map((m) => ({ role: roleOf(m) === "assistant" ? "model" : "user", parts: [{ text: m.text }] })), generationConfig: { maxOutputTokens: maxTokens || 1500, temperature: 0.3 } }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429) throw new QuotaError("provider quota");
    if (!r.ok) throw new Error(`provider ${r.status}`);
    return { text: (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim() };
  },
};
export const chatProvider = {
  name: "chat",
  kinds: ["chat"],
  configured: (env = process.env) => geminiChat.configured(env) || cloudflareChat.configured(env),
  run: (task, env = process.env) => (geminiChat.configured(env) ? geminiChat : cloudflareChat).run(task, env),
};

/** Реестр: вид работы → адаптер. Whisper, OCR и diarization появятся на своих этапах; пока честно «не подключено». */
export const PROVIDERS = { text: cloudflareText, facts: cloudflareText, audio_min: cloudflareWhisper, ocr_pages: null, archive: null, chat: chatProvider };
