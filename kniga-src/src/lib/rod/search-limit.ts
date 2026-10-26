/** Поиск предков по архивам: не больше 10 запросов в месяц на платный аккаунт. */
export const SEARCH_LIMIT = 10;

export type SearchUsage = { month: string; count: number };

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Сколько запросов уже сделано в этом месяце (новый месяц считается с нуля). */
export function usedThisMonth(usage: SearchUsage | undefined, date = new Date()): number {
  return usage && usage.month === monthKey(date) ? usage.count : 0;
}

export function searchesLeft(usage: SearchUsage | undefined, date = new Date()): number {
  return Math.max(0, SEARCH_LIMIT - usedThisMonth(usage, date));
}

export function bumpUsage(usage: SearchUsage | undefined, date = new Date()): SearchUsage {
  return { month: monthKey(date), count: usedThisMonth(usage, date) + 1 };
}
