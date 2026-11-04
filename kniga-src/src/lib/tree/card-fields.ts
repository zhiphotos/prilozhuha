// Что показывать под именем на карточке древа и в PNG/PDF: годы, возраст, место рождения. Выбор хранится на устройстве.
import { useSyncExternalStore } from "react";
import { ageText } from "../rod/age.ts";
import type { Person } from "./types.ts";

export type CardFields = { years: boolean; age: boolean; place: boolean };

const KEY = "kr-card-fields";
const DEFAULTS: CardFields = { years: true, age: false, place: false };

function load(): CardFields {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CardFields>) };
  } catch {
    // без хранилища работает значение по умолчанию
  }
  return { ...DEFAULTS };
}

let current: CardFields = load();
const listeners = new Set<() => void>();

export const getCardFields = (): CardFields => current;

export function setCardFields(patch: Partial<CardFields>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // не страшно: выбор останется до закрытия страницы
  }
  for (const l of listeners) l();
}

export function useCardFields(): CardFields {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getCardFields,
    getCardFields,
  );
}

const shorten = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/** Нижняя строка карточки по выбору человека. `years` приходит снаружи (yearsOf), чтобы не зависеть от kinship.ts. */
export function cardLine(person: Person, years: string, fields: CardFields = current): string {
  const parts: string[] = [];
  if (fields.years) parts.push(years);
  if (fields.age) {
    const age = ageText(person.birthYear, person.deathYear);
    if (age) parts.push(fields.years ? `(${age})` : age);
  }
  if (fields.place && person.birthPlace?.trim()) parts.push(shorten(person.birthPlace.trim(), 18));
  // Годы и возраст склеиваем без точки, место отделяем точкой
  if (!parts.length) return years;
  const place = fields.place && person.birthPlace?.trim() ? parts.pop()! : "";
  const main = parts.join(" ");
  return [main, place].filter(Boolean).join(" · ");
}
