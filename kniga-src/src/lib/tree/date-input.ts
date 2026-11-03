/**
 * Ввод даты с цифровой клавиатуры телефона, где нет точки.
 * Только год: «1989». Полная дата: «18051989» превращается в «18.05.1989».
 * Если человек сам поставил точки (полная клавиатура, месяц и год «05.1989»), оставляем как написано.
 */
export function maskDate(raw: string): string {
  const text = String(raw ?? "").replace(/[,/\-\s]/g, ".");
  if (text.includes(".")) return text.replace(/[^\d.]/g, "").replace(/\.{2,}/g, ".").slice(0, 10);
  const d = text.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

/** Сколько дней в месяце (для проверки календарной даты). */
function daysIn(month: number, year: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Полная дата «дд.мм.гггг»: есть ли такой день в календаре. Неполные даты, годы и слова проверке не подлежат (возвращает true). */
export function isCalendarDate(value: string): boolean {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim());
  if (!m) return true;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysIn(month, year);
}

const digitsOf = (text: string) => text.replace(/\D/g, "");

/** Положение курсора после форматирования: ставим его после того же числа цифр, что стояло левее курсора. */
function caretAfter(value: string, digitsLeft: number, pastDot: boolean): number {
  if (digitsLeft <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (/\d/.test(value[i]!)) seen += 1;
    if (seen === digitsLeft) {
      let at = i + 1;
      if (pastDot && value[at] === ".") at += 1;
      return at;
    }
  }
  return value.length;
}

/**
 * Маска ввода даты в реальном времени. Получает прежнее значение, новое значение поля (после клавиши, удаления или вставки), положение курсора
 * и признак «человек сам ставил точки в этом поле». Возвращает значение, курсор и тот же признак.
 * - Точка ставится, когда набрана СЛЕДУЮЩАЯ цифра, а не сразу: «23» остаётся «23» (это может быть год), «231» становится «23.1», «23.111» становится «23.11.1».
 * - Год «1989»: на третьей цифре мелькает «19.8», на четвёртой пара «89» не может быть месяцем, и значение возвращается к «1989».
 *   Годы вроде 1905 или 1910 похожи на «день.месяц»: их возвращает к году выход из поля (см. yearAfterBlur).
 * - Удаление и правка в середине точек не добавляют; стёртая точка не возвращается.
 * - Слова («около 1974»), диапазоны («1950-1960»), пробелы и любые другие знаки отключают маску: текст остаётся как написан.
 * - Вставка целиком: «23111989» превращается в «23.11.1989», готовая дата не меняется.
 */
export function typeDate(prev: string, next: string, caret: number, manualDots = false): { value: string; caret: number; manualDots: boolean } {
  const cleanPos = Math.max(0, Math.min(caret, next.length));
  if (/[^\d.]/.test(next)) return { value: next, caret: cleanPos, manualDots };
  const grewByOne = next.length === prev.length + 1;
  const atEnd = cleanPos === next.length;
  const pasted = next.length > prev.length + 1;
  const manual = next === "" ? false : manualDots || (grewByOne && next[cleanPos - 1] === ".");
  let value = next.replace(/\.{2,}/g, ".").replace(/^\./, "");
  if (value.split(".").length > 3) value = value.split(".").slice(0, 3).join(".");
  const segs = value.split(".");
  const limits = segs.length === 1 ? [8] : segs.length === 2 ? [2, 4] : [2, 2, 4];
  value = segs.map((seg, i) => seg.slice(0, limits[i] ?? 4)).join(".").slice(0, 10);
  const digitsLeft = digitsOf(next.slice(0, cleanPos)).length;
  if (!value.includes(".") && digitsOf(value).length > 4 && (pasted || grewByOne)) {
    const d = digitsOf(value).slice(0, 8);
    value = `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
    return { value, caret: caretAfter(value, digitsLeft, true), manualDots: manual };
  }
  if (grewByOne && atEnd) {
    const parts = value.split(".");
    if (parts.length === 1 && parts[0]!.length === 3) {
      const day = Number(parts[0]!.slice(0, 2));
      if (day >= 1 && day <= 31) value = `${parts[0]!.slice(0, 2)}.${parts[0]!.slice(2)}`;
    } else if (parts.length === 2 && parts[1]!.length === 3) {
      const month = Number(parts[1]!.slice(0, 2));
      if (month >= 1 && month <= 12) value = `${parts[0]}.${parts[1]!.slice(0, 2)}.${parts[1]!.slice(2)}`;
    } else if (parts.length === 2 && !manual && parts[0]!.length === 2 && parts[1]!.length === 2) {
      const month = Number(parts[1]);
      // «19.89»: такого месяца нет, значит набирают год «1989».
      if (month < 1 || month > 12) value = parts[0]! + parts[1]!;
    }
    return { value, caret: value.length, manualDots: manual };
  }
  if (value === next) return { value, caret: cleanPos, manualDots: manual };
  return { value, caret: caretAfter(value, digitsLeft, false), manualDots: manual };
}

/** Выход из поля: «19.10» или «19.10.» без года, набранные цифрами без своих точек, это год «1910», а не день и месяц. */
export function yearAfterBlur(value: string, manualDots: boolean): string {
  return !manualDots && /^\d\d\.\d\d\.?$/.test(value) ? value.replace(/\./g, "") : value;
}
