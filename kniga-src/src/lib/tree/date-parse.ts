const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
  ЯНВ: 1, ФЕВ: 2, МАР: 3, АПР: 4, МАЯ: 5, МАЙ: 5, ИЮН: 6, ИЮЛ: 7, АВГ: 8, СЕН: 9, ОКТ: 10, НОЯ: 11, ДЕК: 12,
};

const two = (n: number) => String(n).padStart(2, "0");

/**
 * Дата из файла в том виде, как её пишут у нас: «23.05.2002», «05.2002» или «1990».
 * Понимает GEDCOM («23 MAY 2002», «ABT 1900», «BET 1900 AND 1910»), «2002-05-23», «23/05/2002», русские месяцы.
 * День и месяц сохраняются, если они есть в файле; «около» и «до» отбрасываем, оставляя саму дату.
 */
export function normalizeDate(raw: unknown): string {
  // Календарь в GEDCOM помечают как «@#DJULIAN@ 12 OCT 1890»: метку отбрасываем, дату оставляем целиком.
  const text = String(raw ?? "").replace(/@#D[^@]*@/gi, " ").replace(/\s+/g, " ").trim().toUpperCase();
  if (!text || /^[?…\s]*$/.test(text)) return "";
  const body = text.replace(/^(ABT|ABOUT|CAL|EST|BEF|BEFORE|AFT|AFTER|FROM|TO|BET|ОКОЛО|ДО|ПОСЛЕ|~)\.?\s*/, "").replace(/\s+(AND|И|-|–)\s+.*$/, "");
  // 2002-05-23
  let m = body.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${two(+m[3]!)}.${two(+m[2]!)}.${m[1]}`;
  // 23.05.2002, 23/05/2002, 23-05-2002
  m = body.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m && +m[1]! <= 31 && +m[2]! <= 12) return `${two(+m[1]!)}.${two(+m[2]!)}.${m[3]}`;
  // 05.2002
  m = body.match(/^(\d{1,2})[./-](\d{4})$/);
  if (m && +m[1]! <= 12) return `${two(+m[1]!)}.${m[2]}`;
  // 23 MAY 2002 или 23 мая 2002 г.
  m = body.match(/^(\d{1,2})\s+([A-ZА-ЯЁ]{3,})\.?\s+(\d{4})/);
  if (m) {
    const month = MONTHS[m[2]!.slice(0, 3)];
    if (month) return `${two(+m[1]!)}.${two(month)}.${m[3]}`;
  }
  // MAY 2002
  m = body.match(/^([A-ZА-ЯЁ]{3,})\.?\s+(\d{4})/);
  if (m) {
    const month = MONTHS[m[1]!.slice(0, 3)];
    if (month) return `${two(month)}.${m[2]}`;
  }
  const year = body.match(/(?<!\d)(1[0-9]{3}|20\d{2})(?!\d)/);
  return year?.[1] ?? "";
}
