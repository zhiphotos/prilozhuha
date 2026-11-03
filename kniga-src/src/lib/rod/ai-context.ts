import type { Person, Place } from "@/lib/rod/types";

/** Максимум знаков контекста, который уходит на сервер вместе с вопросом (сервер режет на 12000). */
export const CONTEXT_LIMIT = 12000;
const NOTE_LIMIT = 240;

/** Одна строка без управляющих символов и лишних пробелов. Переносы в заметках превращаются в пробел. */
const clean = (value: string | undefined, max = 200) =>
  (value ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const nameOf = (person: Person) => clean(person.name, 80) || "без имени";

/** Сколько связей у человека: по ним решаем, кто важнее, если место кончается. */
function degree(person: Person, people: Person[]): number {
  const id = person.id;
  let n = (person.parents?.length ?? 0) + (person.spouse ? 1 : 0) + (person.moreSpouses?.length ?? 0) + (person.siblingOf ? 1 : 0);
  for (const other of people) {
    if (other.id === id) continue;
    if (other.parents?.includes(id) || other.spouse === id || other.siblingOf === id || other.moreSpouses?.some((s) => s.id === id)) n += 1;
  }
  return n;
}

/**
 * Краткое описание дерева для ИИ: только текст, без фото и личных ссылок. Дерево целиком не уходит:
 * люди идут по убыванию числа связей, пока не кончится место. Каждый человек получает номер, связи пишутся этими номерами.
 */
export function buildTreeContext(people: Person[], places: Place[] = [], limit = CONTEXT_LIMIT): string {
  if (!people.length && !places.length) return "Книга пока пустая: людей и мест нет.";
  const order = people
    .map((person, index) => ({ person, index, score: degree(person, people) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const numberOf = new Map<string, number>();
  order.forEach((item, i) => numberOf.set(item.person.id, i + 1));
  const ref = (id: string | undefined) => {
    if (!id) return "";
    const n = numberOf.get(id);
    const found = people.find((p) => p.id === id);
    return found && n ? `${nameOf(found)} (№${n})` : "";
  };
  const childrenOf = (id: string) => people.filter((p) => p.parents?.includes(id)).map((p) => ref(p.id)).filter(Boolean);

  const head = `Людей в книге: ${people.length}. Мест: ${places.length}. Данные внесены самим владельцем книги и не проверены документами.`;
  const lines: string[] = [];
  let used = head.length + 40;
  let skipped = 0;
  for (const { person, index } of order) {
    void index;
    const bits = [`№${numberOf.get(person.id)} ${nameOf(person)}`];
    const rel = clean(person.relation, 60);
    if (rel) bits.push(`приходится: ${rel}`);
    if (clean(person.birthYear, 20)) bits.push(`родился(ась): ${clean(person.birthYear, 20)}`);
    if (clean(person.deathYear, 20)) bits.push(`умер(ла): ${clean(person.deathYear, 20)}`);
    if (clean(person.maidenName, 60)) bits.push(`девичья фамилия: ${clean(person.maidenName, 60)}`);
    const parents = (person.parents ?? []).map(ref).filter(Boolean);
    if (parents.length) bits.push(`родители: ${parents.join(", ")}`);
    const spouses = [person.spouse, ...(person.moreSpouses ?? []).map((s) => s.id)].map(ref).filter(Boolean);
    if (spouses.length) bits.push(`супруг(а): ${spouses.join(", ")}`);
    if (person.siblingOf) bits.push(`брат или сестра: ${ref(person.siblingOf)}`);
    const kids = childrenOf(person.id);
    if (kids.length) bits.push(`дети: ${kids.slice(0, 12).join(", ")}${kids.length > 12 ? " и другие" : ""}`);
    if (clean(person.notes, NOTE_LIMIT)) bits.push(`заметка: ${clean(person.notes, NOTE_LIMIT)}`);
    const line = bits.join("; ");
    if (used + line.length + 1 > limit - 120) {
      skipped += 1;
      continue;
    }
    lines.push(line);
    used += line.length + 1;
  }
  const out = [head, "Люди:", ...lines];
  if (skipped) out.push(`Ещё ${skipped} человек(а) в контекст не поместились.`);
  const placeLines: string[] = [];
  for (const place of places) {
    const who = (place.peopleIds ?? []).map(ref).filter(Boolean).slice(0, 6).join(", ");
    const text = `${clean(place.name, 80)}${clean(place.years, 30) ? ` (${clean(place.years, 30)})` : ""}${who ? `; связаны: ${who}` : ""}${clean(place.note, 120) ? `; ${clean(place.note, 120)}` : ""}`;
    if (!text.trim()) continue;
    if (used + text.length + 1 > limit - 40) break;
    placeLines.push(text);
    used += text.length + 1;
  }
  if (placeLines.length) out.push("Места:", ...placeLines);
  return out.join("\n").slice(0, limit);
}
