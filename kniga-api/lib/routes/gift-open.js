import { throttled } from "../throttle.js";
import { bodyOf, cors, json } from "../config.js";
import { openGift, validGiftId } from "../gift.js";

// POST /api/gift-open { id, email? }  ->  { code }  – получатель открыл подарок. Код потом вводится как обычный личный код (/api/redeem).
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (await throttled(req, res, "gift-open", 30)) return;
  const body = bodyOf(req);
  const id = String(body.id ?? "");
  if (!validGiftId(id)) return json(res, 404, { error: "Подарок не найден." });
  try {
    const result = await openGift(id, body.email);
    if (result.error) return json(res, result.rec ? 402 : 404, { error: result.rec ? "Подарок ещё не оплачен." : "Подарок не найден." });
    return json(res, 200, { code: result.code });
  } catch (error) {
    console.error("[gift-open]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Не получилось открыть подарок. Попробуйте чуть позже." });
  }
}
