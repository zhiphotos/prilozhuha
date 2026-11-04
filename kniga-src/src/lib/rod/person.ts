import { canHaveMaiden, relationCore } from "@/lib/rod/content";
import type { Person } from "@/lib/rod/types";

const FEMALE = /^(мам|бабуш|прабабуш|прапрабабуш|сестр|тёт|тет|дочь|жена|супруга|внучк|правнучк|племянниц|свекров|тёщ|тещ|золовк|невестк|мачех|падчериц|вдов)/i;
const MALE = /^(пап|дед|прадед|прапрадед|брат|дяд|сын|муж|отец|внук|правнук|племянник|свёкор|свекор|тесть|деверь|зять|шурин|отчим)/i;

/** Пол: выбран руками, иначе по тому, кем приходится. */
export function genderOf(person: Pick<Person, "gender" | "relation">): "m" | "f" | undefined {
  if (person.gender) return person.gender;
  const relation = relationCore(person.relation);
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

/** Кого спрашивать про девичью фамилию на странице «Книга»: женщин-родственниц по маме и бабушке; мужчин (в том числе «дедушка по маме») и тех, у кого она уже записана, нет. */
export function needsMaidenName(person: Pick<Person, "gender" | "relation" | "maidenName">): boolean {
  if ((person.maidenName ?? "").trim()) return false;
  // Пол по первому слову: «мамин брат» это мужчина, а «прапрабабушка» женщина, хотя в общих правилах «пра» повторяется не везде.
  const relation = person.relation.trim().replace(/^(мамин|папин|бабушкин|дедушкин)\s+/i, "").replace(/^(?:пра)+(?=бабуш|дед)/i, "пра");
  if (genderOf({ gender: person.gender, relation }) !== "f") return false;
  return /бабуш|мам/i.test(person.relation);
}
