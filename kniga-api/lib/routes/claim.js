import { accessUntil, orderState } from "../alfa.js";
import { bodyOf, cors, json } from "../config.js";
import { makeToken } from "../token.js";

// POST /api/claim { order, email }  – вернуть доступ на другом устройстве по номеру заказа и почте из чека.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return json(res, 405, { error: "method" });
  const { order, email } = bodyOf(req);
  const number = String(order ?? "").trim();
  const mail = String(email ?? "").trim().toLowerCase();
  if (!/^kr-[0-9a-z]+-[0-9a-f]{8}$/.test(number) || !mail) return json(res, 400, { error: "Проверьте номер заказа и почту." });
  try {
    const state = await orderState({ orderNumber: number });
    // Одинаковый ответ для «нет такого заказа» и «чужая почта», чтобы номера нельзя было подбирать.
    if (!state.ok || state.email !== mail) return json(res, 404, { error: "Оплаченный заказ с такой почтой не найден." });
    return json(res, 200, { token: makeToken({ order: state.orderNumber, until: accessUntil(state.paidAt) }), until: accessUntil(state.paidAt) });
  } catch (error) {
    console.error("[claim]", error instanceof Error ? error.message : error);
    return json(res, 502, { error: "Не получилось проверить заказ. Попробуйте позже." });
  }
}
