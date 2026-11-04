// Дни рождения живых родных для напоминаний: на сервер уходит только «месяц-день» и имя, без фамилии, фото и заметок.
import { parseDate } from "./age.ts";
import type { Person } from "./types.ts";

export type Birthday = { d: string; n: string };

const two = (n: number) => String(n).padStart(2, "0");

export function birthdayList(people: Pick<Person, "name" | "firstName" | "birthYear" | "deathYear">[], max = 200): Birthday[] {
  const out: Birthday[] = [];
  for (const person of people) {
    if (person.deathYear?.trim()) continue;
    const date = parseDate(person.birthYear);
    if (!date?.month || !date.day) continue;
    const name = (person.firstName?.trim() || person.name.trim().split(/\s+/)[0] || "").slice(0, 40);
    if (!name) continue;
    out.push({ d: `${two(date.month)}-${two(date.day)}`, n: name });
    if (out.length >= max) break;
  }
  return out;
}
