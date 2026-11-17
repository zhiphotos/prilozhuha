import { requireAccess } from "../ai/access.js";
import { runChapter } from "../ai/engine.js";
import { json } from "../config.js";

// POST /api/ai-chapter { token, deviceId, requestId, text, style, wish } → { chapter, left, resetAt } или честный отказ. Только платным.
export default async function handler(req, res) {
  const ctx = await requireAccess(req, res);
  if (!ctx) return;
  try {
    const { requestId, ...input } = ctx.body;
    const { status, body } = await runChapter({ owner: ctx.owner, input, requestId });
    return json(res, status, body);
  } catch {
    return json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." });
  }
}
