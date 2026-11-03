import { requireAccess } from "../ai/access.js";
import { runTask } from "../ai/engine.js";
import { json } from "../config.js";

// POST /api/ai-run { token, deviceId, task, requestId, input } → результат задачи ИИ или честный отказ (лимит, квота, выключено).
export default async function handler(req, res) {
  const ctx = await requireAccess(req, res);
  if (!ctx) return;
  try {
    const { status, body } = await runTask({ owner: ctx.owner, task: String(ctx.body.task ?? ""), input: ctx.body.input, requestId: ctx.body.requestId });
    return json(res, status, body);
  } catch {
    return json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." });
  }
}
