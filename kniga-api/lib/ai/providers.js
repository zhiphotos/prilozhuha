// Адаптеры моделей. Единый интерфейс:
//   { name, kinds:[...], configured(env):boolean, run(task, env):Promise<{ text }> }
// Ошибка квоты провайдера должна бросаться как QuotaError, остальные как обычные Error.
// Платного резервного провайдера нет и быть не должно без решения владельца: engine берёт ровно один адаптер на вид работы.
export class QuotaError extends Error {}

const CF = "https://api.cloudflare.com/client/v4/accounts";

export const cloudflareText = {
  name: "cloudflare-text",
  kinds: ["text"],
  configured: (env = process.env) => Boolean(env.CF_ACCOUNT_ID && env.CF_API_TOKEN),
  async run({ system, user }, env = process.env) {
    const model = env.CF_TEXT_MODEL || "@cf/meta/llama-3.1-8b-instruct";
    const r = await fetch(`${CF}/${env.CF_ACCOUNT_ID}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 700 }),
      signal: AbortSignal.timeout(40000),
    });
    const data = await r.json().catch(() => ({}));
    // 4006: дневная бесплатная квота Neurons закончилась; 429: слишком часто. И то и другое: остановиться, не платить.
    if (r.status === 429 || (data.errors ?? []).some((e) => e.code === 4006)) throw new QuotaError("provider quota");
    if (!r.ok || !data.success) throw new Error(`provider ${r.status}`);
    return { text: String(data.result?.response ?? "").trim() };
  },
};

/** Реестр: вид работы → адаптер. Whisper, OCR и diarization появятся на своих этапах; пока честно «не подключено». */
export const PROVIDERS = { text: cloudflareText, audio_min: null, ocr_pages: null, archive: null };
