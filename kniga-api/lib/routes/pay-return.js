import { accessUntil, orderState } from "../alfa.js";
import { isAllowedApp } from "../config.js";
import { makeToken } from "../token.js";

// Банк возвращает сюда после оплаты (?orderId=…&to=<адрес приложения>). Проверяем оплату в банке и отправляем человека обратно в приложение с токеном.
export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const orderId = url.searchParams.get("orderId") ?? "";
  const to = url.searchParams.get("to") ?? "";
  const back = (query, hash = "") => {
    const target = new URL(to);
    target.search = query;
    target.hash = hash;
    res.statusCode = 302;
    res.setHeader("Location", target.toString());
    res.end();
  };
  if (!isAllowedApp(to)) {
    res.statusCode = 400;
    return res.end("bad return address");
  }
  try {
    if (!/^[0-9a-zA-Z-]{8,64}$/.test(orderId)) return back("?paid=0");
    const state = await orderState({ orderId });
    if (!state.ok || !state.orderNumber) return back("?paid=0");
    const token = makeToken({ order: state.orderNumber, until: accessUntil(state.paidAt) });
    return back("?paid=1", `#kr-access=${token}&order=${encodeURIComponent(state.orderNumber)}`);
  } catch (error) {
    console.error("[pay-return]", error instanceof Error ? error.message : error);
    return back("?paid=0");
  }
}
