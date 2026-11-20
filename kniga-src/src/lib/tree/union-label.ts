import type { UnionStatus } from "./types.ts";

/**
 * Слово на плашке пары. Единственный источник «общего ребёнка» – статус союза `coparents`:
 * пара без записи о браке, у которой общий ребёнок (см. from-people.ts). Ничего другого не определяет.
 * Для остальных статусов слова прежние; незнакомый статус остаётся «БРАК», как было.
 */
export const COPARENTS_WORD = "ОБЩИЙ РЕБЁНОК";

export function unionWord(status: UnionStatus): string {
  if (status === "divorced") return "РАЗВОД";
  if (status === "widowed") return "ВДОВСТВО";
  if (status === "partner") return "СОЮЗ";
  if (status === "coparents") return COPARENTS_WORD;
  return "БРАК";
}

/** То же словом строчными, как подписывают пары печатные темы (Богема, Камея, Гжель, Тайга). */
export function unionWordLower(status: UnionStatus | string): string {
  if (status === "divorced") return "развод";
  if (status === "widowed") return "вдов.";
  if (status === "partner") return "союз";
  if (status === "coparents") return COPARENTS_WORD.toLowerCase();
  return "брак";
}
