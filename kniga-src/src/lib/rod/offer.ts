import { PROGRAM_PRICE } from "@/lib/rod/content";

/**
 * Акция «бессрочный доступ» и переход на годовую подписку.
 * Выключено (false): всё выглядит как раньше, ни одна строка не меняется.
 * Включить: true. Тогда до SALE_END показывается предупреждение об акции, после него цена и подписи сами меняются на годовую подписку.
 * Перед включением нужно: поменять цену на сервере оплаты, оферту (LEGAL) и длинные тексты карусели и вопросов (FAQ).
 */
export const OFFER_ON = false;
/** Акция идёт по 30 ноября 2026 включительно; с 1 декабря по Москве начинается подписка. */
export const SALE_END = Date.parse("2026-12-01T00:00:00+03:00");
export const SALE_LAST_DAY = "30 ноября";
export const YEAR_PRICE = "1 999 ₽";

export type OfferPhase = "off" | "sale" | "after";

export function offerPhase(now: number = Date.now(), on: boolean = OFFER_ON): OfferPhase {
  if (!on) return "off";
  return now < SALE_END ? "sale" : "after";
}

/** Сколько дней осталось, считая сегодняшний (в последний день: 1). */
export function saleDaysLeft(now: number = Date.now()): number {
  return Math.max(1, Math.ceil((SALE_END - now) / 86400000));
}

function daysWord(n: number): string {
  const a = n % 100;
  const b = n % 10;
  if (a >= 11 && a <= 14) return "дней";
  if (b === 1) return "день";
  if (b >= 2 && b <= 4) return "дня";
  return "дней";
}

/** Цена, которую видит неоплативший. */
export function priceNow(now: number = Date.now(), on: boolean = OFFER_ON): string {
  return offerPhase(now, on) === "after" ? `${YEAR_PRICE} в год` : PROGRAM_PRICE;
}

/** Показывать ли зачёркнутую старую цену и «скидку»: после акции их нет. */
export function showOldPrice(now: number = Date.now(), on: boolean = OFFER_ON): boolean {
  return offerPhase(now, on) !== "after";
}

/** Короткая строка под кнопкой оплаты. */
export function payNote(now: number = Date.now(), on: boolean = OFFER_ON): string {
  const p = offerPhase(now, on);
  if (p === "after") return "Доступ на год";
  if (p === "sale") return `Один платёж, без подписки. Только до ${SALE_LAST_DAY}`;
  return "Один платёж, без подписки";
}

/** Строка под большой кнопкой покупки на экранах уроков. */
export function lessonPayNote(now: number = Date.now(), on: boolean = OFFER_ON): string {
  return offerPhase(now, on) === "after"
    ? "Доступ на год: приложение, уроки и чат участников"
    : "Платите один раз, навсегда, без подписки и списаний";
}

/** Текст плашки для неоплативших в дни акции; в остальное время null. */
export function saleBannerText(now: number = Date.now(), on: boolean = OFFER_ON): { title: string; text: string } | null {
  if (offerPhase(now, on) !== "sale") return null;
  const n = saleDaysLeft(now);
  return {
    title: n === 1 ? "Сегодня последний день акции" : `Акция до ${SALE_LAST_DAY}: осталось ${n} ${daysWord(n)}`,
    text: `Бессрочный доступ за ${PROGRAM_PRICE} можно открыть только сейчас. С 1 декабря будет только подписка ${YEAR_PRICE} в год. Бесплатные функции останутся с вами.`,
  };
}
