import type { UnionStatus } from "./types.ts";

/**
 * Слово на плашке пары. Единственный источник «общего ребёнка» – статус союза `coparents`:
 * пара без записи о браке, у которой общий ребёнок (см. from-people.ts). Ничего другого не определяет.
 * Для остальных статусов слова прежние; незнакомый статус остаётся «БРАК», как было.
 */
export const COPARENTS_WORD = "ОБЩИЙ РЕБЁНОК";
const UNKNOWN_WORD = "ПАРА";

export function unionWord(status: UnionStatus): string {
  if (status === "divorced") return "РАЗВОД";
  if (status === "widowed") return "ВДОВСТВО";
  if (status === "partner") return "СОЮЗ";
  if (status === "coparents") return COPARENTS_WORD;
  if (status === "married") return "БРАК";
  return UNKNOWN_WORD; // статус не из списка: нейтральное «пара», а не выдумка про брак
}

/** То же словом строчными, как подписывают пары печатные темы (Богема, Камея, Гжель, Тайга). */
export function unionWordLower(status: UnionStatus | string): string {
  if (status === "divorced") return "развод";
  if (status === "widowed") return "вдов.";
  if (status === "partner") return "союз";
  if (status === "coparents") return COPARENTS_WORD.toLowerCase();
  if (status === "married") return "брак";
  return UNKNOWN_WORD.toLowerCase();
}

/**
 * Длинная подпись в две строки (для «Гжели»: между рамками мало места). Строки разделены символом перевода строки;
 * остальные слова короткие и остаются в одну строку. Рисуют такую подпись по строкам (см. markLines).
 */
export function twoLineWord(word: string): string {
  return word === COPARENTS_WORD.toLowerCase() ? "общий\nребёнок" : word;
}

/** Строки подписи: у обычных слов одна, у двухстрочных две. */
export const markLines = (text: string): string[] => text.split("\n");
