import { normalizeDate } from "@/lib/tree/date-parse";

/** Число для сортировки по дате: год, потом месяц, потом день. Без года (нет даты в тексте) – null, такие идут в конец. */
export function dateKey(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  const norm = normalizeDate(text);
  let m = norm.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1]);
  m = norm.match(/^(\d{2})\.(\d{4})$/);
  if (m) return Number(m[2]) * 10000 + Number(m[1]) * 100;
  m = norm.match(/^(\d{4})$/);
  if (m) return Number(m[1]) * 10000;
  // «1950-е», «в 1941», «весна 1945»: берём первое число из 3–4 цифр.
  const loose = text.match(/(?<!\d)(\d{3,4})(?!\d)/);
  return loose ? Number(loose[1]) * 10000 : null;
}

/** События по порядку дат от старых к новым; без даты в конце; равные даты сохраняют прежний порядок. */
export function sortByDate<T extends { year: string }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index, key: dateKey(item.year) }))
    .sort((a, b) => {
      if (a.key === null && b.key === null) return a.index - b.index;
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      return a.key - b.key || a.index - b.index;
    })
    .map((x) => x.item);
}
