import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { rootCertificates } from "node:tls";
import { RUSSIAN_ROOT_CA } from "./russian-root-ca.js";
import { ACCESS_DAYS, PRICE_RUB, PRODUCT_NAME } from "./config.js";

/**
 * Интернет-эквайринг Альфа-Банка (шлюз RBS, REST).
 *   ALFA_BASE_URL      тест: https://alfa.rbsuat.com/payment/rest, бой: https://pay.alfabank.ru/payment/rest
 *   ALFA_API_USER      логин API (r-<магазин>-api)
 *   ALFA_API_PASSWORD  пароль API
 *   ALFA_TAX_SYSTEM    система налогообложения для чека: 0 общая, 1 УСН доходы, 2 УСН доходы минус расходы, 4 ЕСХН, 5 патент
 *   ALFA_VAT_TYPE      ставка НДС в чеке: 0 без НДС (по умолчанию), 2 – 10 %, 6 – 20 %
 * Доступ выдаётся только после того, как сам шлюз подтвердил оплату (orderStatus 2) на нужную сумму.
 */
const TEST_BASE = "https://alfa.rbsuat.com/payment/rest";

function cfg() {
  const user = process.env.ALFA_API_USER?.trim();
  const password = process.env.ALFA_API_PASSWORD?.trim();
  if (!user || !password) throw new Error("alfa not configured");
  return { user, password, base: (process.env.ALFA_BASE_URL?.trim() || TEST_BASE).replace(/\/$/, "") };
}

export const alfaConfigured = () => Boolean(process.env.ALFA_API_USER && process.env.ALFA_API_PASSWORD);

async function call(method, params) {
  const { user, password, base } = cfg();
  const body = new URLSearchParams({ userName: user, password, ...params }).toString();
  const ca = [...rootCertificates, RUSSIAN_ROOT_CA];
  return await new Promise((resolve, reject) => {
    const request = base.startsWith("http://") ? httpRequest : httpsRequest; // http нужен только для проверки на своём компьютере
    const req = request(
      `${base}/${method}`,
      { method: "POST", ca, timeout: 15000, headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          if ((res.statusCode ?? 0) >= 400) return reject(new Error(`alfa ${method} http ${res.statusCode}`));
          try {
            resolve(JSON.parse(text));
          } catch {
            reject(new Error(`alfa ${method}: bad json`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`alfa ${method} timeout`)));
    req.on("error", reject);
    req.end(body);
  });
}

/** Корзина для кассового чека (54-ФЗ): банк сам формирует чек и отправляет его покупателю на почту. */
function bundle(email, amountKop) {
  return JSON.stringify({
    customerDetails: { email },
    cartItems: {
      items: [
        {
          positionId: 1,
          name: PRODUCT_NAME,
          quantity: { value: 1, measure: "шт" },
          itemAmount: amountKop,
          itemCode: "kniga-roda-program",
          itemPrice: amountKop,
          tax: { taxType: Number(process.env.ALFA_VAT_TYPE || 0) },
          // 4 – полный расчёт, 4 – услуга (признаки способа и предмета расчёта)
          itemAttributes: { attributes: [{ name: "paymentMethod", value: 4 }, { name: "paymentObject", value: 4 }] },
        },
      ],
    },
  });
}

/** Регистрируем заказ и возвращаем адрес платёжной страницы банка. */
export async function createCheckout({ email, ads, legal, returnUrl, failUrl }) {
  const amount = PRICE_RUB * 100;
  const orderNumber = `kr-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const answer = await call("register.do", {
    orderNumber,
    amount: String(amount),
    currency: "643",
    returnUrl,
    failUrl,
    description: `${PRODUCT_NAME}`.slice(0, 99),
    email,
    language: "ru",
    taxSystem: String(process.env.ALFA_TAX_SYSTEM ?? "1"),
    orderBundle: bundle(email, amount),
    // Запись согласий: что принял покупатель и в какой редакции документов (остаётся в заказе у банка).
    jsonParams: JSON.stringify({ email, product: "kniga-roda", consentPd: true, consentAds: Boolean(ads), legal: String(legal ?? "").slice(0, 20), at: new Date().toISOString() }),
  });
  if (!answer.orderId || !answer.formUrl) throw new Error(`alfa register: ${answer.errorCode ?? ""} ${answer.errorMessage ?? ""}`.trim());
  return { formUrl: answer.formUrl, orderId: answer.orderId, orderNumber };
}

/** Состояние заказа в банке. Передайте orderId (после возврата с оплаты) или orderNumber (номер из чека). */
export async function orderState(ref) {
  const answer = await call("getOrderStatusExtended.do", ref.orderId ? { orderId: ref.orderId } : { orderNumber: ref.orderNumber });
  const params = Array.isArray(answer.merchantOrderParams) ? answer.merchantOrderParams : [];
  const email = String(params.find((p) => p.name === "email")?.value ?? answer.payerData?.email ?? answer.orderBundle?.customerDetails?.email ?? "").trim().toLowerCase();
  const paidAt = Number(answer.authDateTime || answer.date || Date.now());
  return {
    ok: answer.orderStatus === 2 && answer.amount === PRICE_RUB * 100,
    refunded: answer.orderStatus === 4,
    orderNumber: String(answer.orderNumber ?? ref.orderNumber ?? ""),
    email,
    paidAt: Number.isFinite(paidAt) ? paidAt : Date.now(),
  };
}

export const accessUntil = (paidAt) => paidAt + ACCESS_DAYS * 86400000;
