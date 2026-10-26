import type { Person } from "./types.ts";

/** Нижний регистр, «ё» как «е», без лишних знаков: «Фёдоров» находится по «федо». */
export function norm(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Поиск людей по древу по мере набора. Слова запроса ищутся в любом порядке
 * и по началу слов имени, отчества, фамилии, а также в годах и заметке.
 * Сначала идут те, у кого запрос совпал с началом имени или фамилии.
 */
export function searchPeople(people: Person[], query: string, limit = 50): Person[] {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  const scored: { person: Person; score: number }[] = [];
  for (const person of people) {
    const names = norm(`${person.lastName} ${person.firstName} ${person.patronymic}`).split(" ").filter(Boolean);
    const extra = norm(`${person.birthYear} ${person.deathYear} ${person.note}`).split(" ").filter(Boolean);
    let score = 0;
    let ok = true;
    for (const token of tokens) {
      if (names.some((word) => word === token)) score += 3;
      else if (names.some((word) => word.startsWith(token))) score += 2;
      else if (extra.some((word) => word.startsWith(token))) score += 1;
      else if (token.length >= 3 && names.some((word) => word.includes(token))) score += 0.5;
      else {
        ok = false;
        break;
      }
    }
    if (ok) scored.push({ person, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((item) => item.person);
}
