import { isAllowedApp } from "../config.js";
import { settleGift, validGiftId } from "../gift.js";

// Банк возвращает дарителя сюда (?gift=<номер>&to=<адрес приложения>). Если банк подтвердил оплату, даритель попадает на экран «Отправьте ссылку».
export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const id = url.searchParams.get("gift") ?? "";
  const to = url.searchParams.get("to") ?? "";
  if (!isAllowedApp(to)) {
    res.statusCode = 400;
    return res.end("bad return address");
  }
  const back = (search, hash = "") => {
    const target = new URL(to);
    target.search = search;
    target.hash = hash;
    res.statusCode = 302;
    res.setHeader("Location", target.toString());
    res.end();
  };
  try {
    if (!validGiftId(id)) return back("?paid=0");
    const rec = await settleGift(id);
    return rec && (rec.status === "paid" || rec.status === "opened") ? back("", `#/gift-made/${id}`) : back("?paid=0");
  } catch (error) {
    console.error("[gift-return]", error instanceof Error ? error.message : error);
    return back("?paid=0");
  }
}
