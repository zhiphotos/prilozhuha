import { requireAccess } from "../ai/access.js";
import { aiEnabled } from "../ai/limits.js";
import { PROVIDERS } from "../ai/providers.js";
import { usage } from "../ai/quota.js";
import { json } from "../config.js";

// POST /api/ai-status { token, deviceId } → включён ли ИИ, какие функции подключены, остатки личных лимитов и даты обновления.
export default async function handler(req, res) {
  const ctx = await requireAccess(req, res);
  if (!ctx) return;
  try {
    const available = Object.fromEntries(Object.entries(PROVIDERS).map(([kind, p]) => [kind, Boolean(p?.configured())]));
    return json(res, 200, { enabled: aiEnabled(), available, usage: await usage(ctx.owner) });
  } catch {
    return json(res, 502, { error: "Хранилище не ответило. Попробуйте позже." });
  }
}
