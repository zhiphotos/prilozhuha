import { requireAccess } from "../ai/access.js";
import { runTranscribe } from "../ai/engine.js";
import { json } from "../config.js";

// POST /api/ai-transcribe { token, deviceId, requestId, audio (WAV, base64), seconds, language, prompt } → { text, segments, left, resetAt } или честный отказ.
export default async function handler(req, res) {
  const ctx = await requireAccess(req, res);
  if (!ctx) return;
  try {
    const { status, body } = await runTranscribe({ owner: ctx.owner, audio: ctx.body.audio, seconds: ctx.body.seconds, language: ctx.body.language, prompt: ctx.body.prompt, requestId: ctx.body.requestId });
    return json(res, status, body);
  } catch {
    return json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." });
  }
}
