import { requireAccess } from "../ai/access.js";
import { runSeek } from "../ai/engine.js";
import { json } from "../config.js";

// POST /api/ai-seek { token, deviceId, requestId, question, variants, place, seek, leads } → { summary, leads, tips, sources, left, resetAt } или честный отказ. Только платным.
export default async function handler(req, res) {
  const ctx = await requireAccess(req, res);
  if (!ctx) return;
  try {
    const { requestId, ...input } = ctx.body;
    const { status, body } = await runSeek({ owner: ctx.owner, input, requestId });
    return json(res, status, body);
  } catch {
    return json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." });
  }
}
