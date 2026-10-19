import { canHaveMaiden } from "@/lib/rod/content";
import type { Person } from "@/lib/rod/types";

const FEMALE = /^(мам|бабуш|прабабуш|сестр|тёт|тет|дочь|жена|супруга|внучк)/i;
const MALE = /^(пап|дед|прадед|брат|дяд|сын|муж|отец|внук)/i;

/** Пол: выбран руками, иначе по тому, кем приходится. */
export function genderOf(person: Pick<Person, "gender" | "relation">): "m" | "f" | undefined {
  if (person.gender) return person.gender;
  const relation = person.relation.trim();
  if (FEMALE.test(relation)) return "f";
  if (MALE.test(relation)) return "m";
  return undefined;
}

export function maidenAllowed(person: Pick<Person, "gender" | "relation">): boolean {
  const gender = genderOf(person);
  return gender === "m" ? false : gender === "f" ? true : canHaveMaiden(person.relation);
}

export function composeName(parts: { firstName?: string; patronymic?: string; lastName?: string }): string {
  return [parts.firstName, parts.patronymic, parts.lastName].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
}

/** Части имени: у старых записей есть только `name`, разбираем его (Имя Фамилия или Имя Отчество Фамилия). */
export function partsOf(person: Pick<Person, "name" | "firstName" | "patronymic" | "lastName">): { firstName: string; patronymic: string; lastName: string } {
  if (person.firstName !== undefined || person.patronymic !== undefined || person.lastName !== undefined) {
    return { firstName: person.firstName ?? "", patronymic: person.patronymic ?? "", lastName: person.lastName ?? "" };
  }
  const words = person.name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 3) return { firstName: words[0], patronymic: words[1], lastName: words.slice(2).join(" ") };
  if (words.length === 2) return { firstName: words[0], patronymic: "", lastName: words[1] };
  return { firstName: words[0] ?? "", patronymic: "", lastName: "" };
}

/** Когда человек появляется на ленте: рождение и уход по годам, которые вписали в карточке. */
export function personEvents(people: Person[]): { id: string; year: string; title: string; detail: string; personId: string }[] {
  const out: { id: string; year: string; title: string; detail: string; personId: string }[] = [];
  for (const person of people) {
    const female = genderOf(person) === "f";
    if (person.birthYear.trim()) out.push({ id: `b-${person.id}`, year: person.birthYear.trim(), title: `${female ? "Родилась" : genderOf(person) === "m" ? "Родился" : "Родился(ась)"} ${person.name}`, detail: person.relation, personId: person.id });
    if (person.deathYear?.trim()) out.push({ id: `d-${person.id}`, year: person.deathYear.trim(), title: `${female ? "Ушла из жизни" : genderOf(person) === "m" ? "Ушёл из жизни" : "Ушёл(ушла) из жизни"} ${person.name}`, detail: person.relation, personId: person.id });
  }
  return out;
}
