import type { FamilyPhoto, Person } from "@/lib/rod/types";

type WithPeople = Pick<FamilyPhoto, "personId"> & { personIds?: string[] };

/** Люди, привязанные к фото: новый список или единственная привязка из прежних книг. */
export function photoPeopleIds(photo: WithPeople): string[] {
  if (photo.personIds && photo.personIds.length) return [...new Set(photo.personIds)];
  return photo.personId ? [photo.personId] : [];
}

/** Подпись фото: что написал человек, а если ничего – имена отмеченных людей (так выбор человека сразу делает подпись и открывает «Сохранить»). */
export function photoCaption(who: string, ids: string[], people: Pick<Person, "id" | "name">[]): string {
  const typed = who.trim();
  if (typed) return typed;
  return ids.map((id) => people.find((person) => person.id === id)?.name.trim()).filter((name): name is string => Boolean(name)).join(", ");
}

/** Можно ли сохранять: нужен снимок и подпись (написанная или собранная из отмеченных людей). */
export function canSavePhoto(input: { dataUrl: string; who: string; ids: string[]; people: Pick<Person, "id" | "name">[]; busy?: boolean }): boolean {
  return Boolean(input.dataUrl) && !input.busy && photoCaption(input.who, input.ids, input.people) !== "";
}

/** Поля привязки для записи фото: первый человек остаётся в прежнем поле personId, чтобы старые копии и другие устройства читали книгу как раньше. */
export function photoLinkFields(ids: string[]): { personId: string; personIds: string[] } {
  const unique = [...new Set(ids)];
  return { personId: unique[0] ?? "", personIds: unique };
}
