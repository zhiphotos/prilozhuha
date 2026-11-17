import { requireAccess } from "../ai/access.js";
import { runChat } from "../ai/engine.js";
import { json } from "../config.js";

// POST /api/ai-chat { token, deviceId, requestId, messages:[{role,text}] } → { reply, sources, left, resetAt } или честный отказ. Только платным.
export default async function handler(req, res) {
  const ctx = await requireAccess(req, res);
  if (!ctx) return;
  try {
    const { status, body } = await runChat({ owner: ctx.owner, messages: ctx.body.messages, requestId: ctx.body.requestId });
    return json(res, status, body);
  } catch {
    return json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." });
  }
}
