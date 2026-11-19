import { throttled } from "../throttle.js";
import { bodyOf, cors, json } from "../config.js";
import { settleGift, validGiftId } from "../gift.js";

// POST /api/gift-info { id }  – что показать на открытке. Почта дарителя и код наружу не отдаются.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  if (await throttled(req, res, "gift-info", 120)) return;
  const id = String(bodyOf(req).id ?? "");
  if (!validGiftId(id)) return json(res, 404, { error: "Подарок не найден." });
  try {
    const rec = await settleGift(id);
    if (!rec) return json(res, 404, { error: "Подарок не найден." });
    if (rec.status !== "paid" && rec.status !== "opened") return json(res, 200, { status: rec.status === "refunded" ? "refunded" : "unpaid" });
    return json(res, 200, { status: rec.status, ...rec.card });
  } catch (error) {
    console.error("[gift-info]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Не получилось открыть подарок. Попробуйте чуть позже." });
  }
}
