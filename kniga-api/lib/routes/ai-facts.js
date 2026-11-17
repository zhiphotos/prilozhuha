import { requireAccess } from "../ai/access.js";
import { runFacts } from "../ai/engine.js";
import { json } from "../config.js";

// POST /api/ai-facts { token, deviceId, requestId, text } → { facts, dropped, left, resetAt } или честный отказ. Только платным (как расшифровка).
export default async function handler(req, res) {
  const ctx = await requireAccess(req, res);
  if (!ctx) return;
  try {
    const { status, body } = await runFacts({ owner: ctx.owner, text: ctx.body.text, requestId: ctx.body.requestId });
    return json(res, status, body);
  } catch {
    return json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." });
  }
}
