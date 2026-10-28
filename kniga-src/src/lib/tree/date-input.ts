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
