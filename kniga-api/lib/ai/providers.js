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

/** Реестр: вид работы → адаптер. Whisper, OCR и diarization появятся на своих этапах; пока честно «не подключено». */
export const PROVIDERS = { text: cloudflareText, facts: cloudflareText, audio_min: cloudflareWhisper, ocr_pages: null, archive: null };
