// Возраст человека по строкам дат: «28.10.1961», «1989», «около 1974», «28.05.1968?». Нужен для подписи «(64 года)» в карточке.
// Если дату нельзя разобрать, возраста нет (ничего не придумываем).

export type ParsedDate = { year: number; month?: number; day?: number; approx: boolean };

/** Разбирает строку даты. Понимает «дд.мм.гггг», «мм.гггг», «гггг», слова «около», «~», «?» (тогда approx). */
export function parseDate(text: string | undefined): ParsedDate | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const approx = /\?|около|~|≈|примерно|ок\./i.test(raw);
  const full = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (full) {
    const day = Number(full[1]);
    const month = Number(full[2]);
    const year = Number(full[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1000) return { year, month, day, approx };
  }
  const monthYear = raw.match(/(?:^|\D)(\d{1,2})[./-](\d{4})(?:\D|$)/);
  if (monthYear && Number(monthYear[1]) >= 1 && Number(monthYear[1]) <= 12) return { year: Number(monthYear[2]), month: Number(monthYear[1]), approx };
  const years = raw.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g);
  if (years?.length === 1) return { year: Number(years[0]), approx: approx || false };
  return null;
}

/** «год / года / лет» для числа. */
export function yearsWord(n: number): string {
  const last = n % 10;
  const tens = n % 100;
  if (tens >= 11 && tens <= 14) return "лет";
  if (last === 1) return "год";
  if (last >= 2 && last <= 4) return "года";
  return "лет";
}

function diffYears(from: ParsedDate, to: ParsedDate): { years: number; exact: boolean } {
  let years = to.year - from.year;
  const exact = !!(from.month && to.month);
  if (exact) {
    const before = to.month! < from.month! || (to.month === from.month && (to.day ?? 1) < (from.day ?? 1));
    if (before) years -= 1;
  }
  return { years, exact };
}

/** Возраст: живому «64 года» (от даты рождения до сегодняшнего дня), ушедшему «88 лет» (между датами). Если даты нет или она неразборчива, null. */
export function ageText(birth: string | undefined, death: string | undefined, now: Date = new Date()): string | null {
  const b = parseDate(birth);
  if (!b) return null;
  const d = parseDate(death);
  const end: ParsedDate = d ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), approx: false };
  const { years, exact } = diffYears(b, end);
  if (years < 0 || years > 125) return null;
  const mark = b.approx || (d?.approx ?? false) || !exact ? "≈ " : "";
  return `${mark}${years} ${yearsWord(years)}`;
}

/** «сколько лет назад»: для дат событий и «умер(ла)». */
export function yearsAgoText(date: string | undefined, now: Date = new Date()): string | null {
  const p = parseDate(date);
  if (!p) return null;
  const { years, exact } = diffYears(p, { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate(), approx: false });
  if (years < 0 || years > 1500) return null;
  if (years === 0) return "в этом году";
  return `${p.approx || !exact ? "≈ " : ""}${years} ${yearsWord(years)} назад`;
}
