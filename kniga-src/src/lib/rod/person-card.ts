import type { Person } from "@/lib/rod/types";

const years = (p: Person) => {
  const b = p.birthYear?.trim();
  const d = p.deathYear?.trim();
  if (b && d) return `${b} – ${d}`;
  if (b) return `род. ${b}`;
  if (d) return `ум. ${d}`;
  return "";
};

const names = (list: Person[]) => list.map((p) => p.name).filter(Boolean);

/** Краткая карточка человека: ФИО, годы, место рождения, родители и ближайшие родные. Пустые строки не пишем. */
export function personCardLines(person: Person, people: Person[]): string[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const parents = (person.parents ?? []).map((id) => byId.get(id)).filter((p): p is Person => Boolean(p));
  const kids = people.filter((p) => (p.parents ?? []).includes(person.id));
  const spouseIds = new Set<string>([person.spouse ?? "", ...(person.moreSpouses ?? []).map((m) => m.id), ...people.filter((p) => p.spouse === person.id).map((p) => p.id)].filter(Boolean));
  const spouses = [...spouseIds].map((id) => byId.get(id)).filter((p): p is Person => Boolean(p));
  const sib = new Set<string>();
  for (const p of people) {
    if (p.id === person.id) continue;
    const shared = parents.length > 0 && (p.parents ?? []).some((id) => parents.some((q) => q.id === id));
    if (shared || p.siblingOf === person.id || person.siblingOf === p.id) sib.add(p.id);
  }
  const siblings = [...sib].map((id) => byId.get(id)).filter((p): p is Person => Boolean(p));
  const lines = [person.name];
  const life = years(person);
  if (life) lines.push(life);
  if (person.birthPlace?.trim()) lines.push(person.birthPlace.trim());
  if (parents.length) lines.push(`Родители: ${names(parents).join(", ")}`);
  if (spouses.length) {
    const label = spouses.every((s) => s.gender === "m") ? "Муж" : spouses.every((s) => s.gender === "f") ? "Жена" : "Супруг(а)";
    lines.push(`${label}: ${names(spouses).join(", ")}`);
  }
  if (siblings.length) lines.push(`Братья и сёстры: ${names(siblings).join(", ")}`);
  if (kids.length) lines.push(`Дети: ${names(kids).join(", ")}`);
  return lines;
}

export const personCardText = (person: Person, people: Person[]) => personCardLines(person, people).join("\n");
