import { buildKinIndex, bloodPaths, kinshipIn, spouseWordIn, type KinIndex } from "./kinship.ts";
import { MODE_SCOPE, scopeFilter, type CenterMode } from "./scope.ts";
import { norm } from "./search.ts";
import type { Kinship, Person, Union } from "./types.ts";

/**
 * Перестроение древа от любого человека.
 * Центр – только состояние экрана. Здесь ничего не пишется в книгу: функции читают людей и союзы и возвращают новое.
 * Родство считается по реальным связям (родители, союзы, братья и сёстры через общих родителей),
 * слово «кем приходится мне» сюда не попадает: оно участвует только при сборке древа от записи «я».
 */

export const UNDETERMINED = "Родство не определено";

export type RelationFromCenter = {
  id: string;
  /** Основное название: «Двоюродный брат», «Бабушка», «Жена»; у центра – «Центр». */
  title: string;
  kind: Kinship["kind"] | "center" | "undetermined";
  degree: number | null;
  /** Другие названия того же человека, если к нему ведёт ещё один путь («также …»), по порядку. */
  also: string[];
  /** Сколько разных путей родства найдено (общие предки, повторяющиеся линии). */
  paths: number;
  /** Данных не хватает: родство не придумываем. */
  undetermined: boolean;
};

const isGhostId = (id: string) => id.startsWith("__") && id !== "__self";

/** Человека можно выбрать центром, если он настоящая запись, а не пустая заготовка «Мама» или «Папа». */
export function canBeCenter(person: Person): boolean {
  return !isGhostId(person.id);
}

function relationIn(index: KinIndex, centerId: string, personId: string, homeId?: string): RelationFromCenter {
  if (centerId === personId) return { id: personId, title: centerId === homeId ? "Я" : "Центр", kind: "center", degree: 0, also: [], paths: 1, undetermined: false };
  const main = kinshipIn(index, centerId, personId);
  if (main.kind === "other") {
    return { id: personId, title: UNDETERMINED, kind: "undetermined", degree: null, also: [], paths: 0, undetermined: true };
  }
  const title = main.card;
  let paths = 1;
  const also: string[] = [];
  if (main.kind === "ancestor" || main.kind === "descendant" || main.kind === "sibling" || main.kind === "collateral") {
    const found = bloodPaths(index, centerId, personId);
    if (found.length) {
      paths = found.reduce((n, p) => n + p.count, 0);
      // Основное название остаётся тем, что выбрала kinship; остальные идут за ним по порядку.
      for (const p of found) if (p.title !== main.title && !also.includes(p.title)) also.push(p.title);
    }
  }
  // Кровный родственник, который ещё и супруг (редкий, но возможный случай): не прячем второй путь.
  if (main.kind !== "spouse" && main.kind !== "inlaw") {
    const spouse = spouseWordIn(index, centerId, personId);
    if (spouse) { also.push(spouse); paths += 1; }
  }
  return { id: personId, title, kind: main.kind, degree: main.degree, also, paths, undetermined: false };
}

/** Родство каждого человека книги от выбранного центра. Нет центра в списке – пустой результат. */
export function relationsFrom(people: Person[], unions: Union[], centerId: string, homeId?: string): Map<string, RelationFromCenter> {
  const out = new Map<string, RelationFromCenter>();
  if (!people.some((p) => p.id === centerId)) return out;
  const index = buildKinIndex(people, unions);
  for (const p of people) out.set(p.id, relationIn(index, centerId, p.id, homeId));
  return out;
}

/** Родство одного человека от центра (для карточки человека). */
export function relationOf(people: Person[], unions: Union[], centerId: string, personId: string, homeId?: string): RelationFromCenter {
  if (!people.some((x) => x.id === centerId) || !people.some((x) => x.id === personId)) {
    return { id: personId, title: UNDETERMINED, kind: "undetermined", degree: null, also: [], paths: 0, undetermined: true };
  }
  return relationIn(buildKinIndex(people, unions), centerId, personId, homeId);
}

/** Подпись для карточки: «Двоюродный брат» или с пометкой «несколько путей». */
export function relationCard(rel: RelationFromCenter): string {
  return rel.paths > 1 && !rel.also.length ? `${rel.title} (несколько путей)` : rel.title;
}

/** Развёрнутая подпись для карточки человека: «Двоюродный брат. Также: Троюродный дядя». */
export function relationNote(rel: RelationFromCenter): string {
  if (rel.undetermined) return `${UNDETERMINED}: в книге не хватает связей, чтобы назвать родство.`;
  const parts = [rel.title];
  if (rel.also.length) parts.push(`Также: ${rel.also.join("; ")}`);
  else if (rel.paths > 1) parts.push(`Несколько путей родства: ${rel.paths}`);
  return parts.join(". ");
}

/** Что показывать на экране для выбранного центра и режима. Данные книги не меняются. */
export function viewFrom(people: Person[], unions: Union[], centerId: string, mode: CenterMode) {
  return scopeFilter(people, unions, centerId, MODE_SCOPE[mode]);
}

function surnameKey(p: Person): string {
  return norm(`${p.lastName} ${p.firstName} ${p.patronymic}`);
}

/** Алфавитный список для выбора центра: по фамилии, затем по имени; без пустых заготовок. */
export function centerCandidates(people: Person[], query = ""): Person[] {
  const q = norm(query).split(" ").filter(Boolean);
  return people
    .filter(canBeCenter)
    .filter((p) => {
      if (!q.length) return true;
      const words = surnameKey(p).split(" ");
      return q.every((t) => words.some((w) => w.startsWith(t)));
    })
    .sort((a, b) => {
      const ka = surnameKey(a);
      const kb = surnameKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : a.id < b.id ? -1 : 1;
    });
}
