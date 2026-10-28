// Жирные слова в тексте страницы: в тексте это **слово**. Каждое слово размечается отдельно, поэтому перенос строки и страницы разметку не ломает.

/** «**два слова**» -> «**два** **слова**»; непарные ** считаются началом жирного до конца текста. */
export function explodeBold(text: string): string {
  if (!text.includes("**")) return text;
  let bold = false;
  return text
    .split("**")
    .map((part) => {
      const out = bold ? part.replace(/[^\s]+/g, (word) => `**${word}**`) : part;
      bold = !bold;
      return out;
    })
    .join("");
}

/** Текст без разметки жирного. */
export function stripBold(text: string): string {
  return text.includes("**") ? text.replace(/\*\*/g, "") : text;
}

export type BoldPart = { text: string; bold: boolean };

/** Кусочки строки для показа: жирные слова отдельно. */
export function boldParts(text: string): BoldPart[] {
  if (!text.includes("**")) return [{ text, bold: false }];
  const parts: BoldPart[] = [];
  let bold = false;
  text.split("**").forEach((part) => {
    if (part) parts.push({ text: part, bold });
    bold = !bold;
  });
  return parts;
}

/** Выделенное в поле: добавляет или снимает жирный. Возвращает новый текст и границы выделения. */
export function toggleBold(value: string, from: number, to: number): { text: string; from: number; to: number } | null {
  if (to <= from) return null;
  const chosen = value.slice(from, to);
  if (chosen.startsWith("**") && chosen.endsWith("**") && chosen.length > 4) {
    const inner = chosen.slice(2, -2);
    return { text: value.slice(0, from) + inner + value.slice(to), from, to: from + inner.length };
  }
  if (value.slice(from - 2, from) === "**" && value.slice(to, to + 2) === "**") {
    return { text: value.slice(0, from - 2) + chosen + value.slice(to + 2), from: from - 2, to: to - 2 };
  }
  return { text: `${value.slice(0, from)}**${chosen}**${value.slice(to)}`, from: from + 2, to: to + 2 };
}
