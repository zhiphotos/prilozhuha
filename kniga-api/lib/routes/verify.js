import { orderState } from "../alfa.js";
import { bodyOf, cors, json } from "../config.js";
import { platformUntil } from "./platform-login.js";
import { readToken } from "../token.js";

// POST /api/verify { token }  – доступ ещё действует? (подпись, срок и то, что платёж не возвращён)
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const data = readToken(String(bodyOf(req).token ?? ""));
  if (!data) return json(res, 200, { valid: false });
  if (Date.now() > data.until) return json(res, 200, { valid: false, reason: "expired" });
  try {
    const state = await orderState({ orderNumber: data.order });
    return json(res, 200, { valid: state.ok && !state.refunded, until: data.until });
  } catch {
    // Банк не ответил: не отнимаем доступ из-за чужого сбоя.
    return json(res, 200, { valid: true, until: data.until, unchecked: true });
  }
}
