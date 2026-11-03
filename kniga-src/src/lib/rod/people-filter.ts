import type { Person } from "./types.ts";

/** Нижний регистр, «ё» как «е», без знаков: «Фёдоров» находится по «федо». */
function norm(text: string): string {
  return text.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Поиск по списку «Люди». Слова запроса ищутся в любом порядке и по началу слов
 * имени, девичьей фамилии, родства, года и заметки. Пустой запрос возвращает всех как есть.
 */
export function filterPeople(people: Person[], query: string): Person[] {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (!tokens.length) return people;
  return people.filter((person) => {
    const words = norm(`${person.name} ${person.maidenName ?? ""} ${person.relation ?? ""} ${person.birthYear ?? ""} ${person.deathYear ?? ""} ${person.notes ?? ""}`)
      .split(" ")
      .filter(Boolean);
    return tokens.every((token) => words.some((word) => word.startsWith(token)));
  });
}
