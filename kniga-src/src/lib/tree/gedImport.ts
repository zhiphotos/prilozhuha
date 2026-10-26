import type { TreeData } from "./types.ts";
import { kinship } from "./kinship.ts";

/** Человек из GED в виде, который хранится в списке «Люди». Связи – через id из списка. */
export type ImportedPerson = {
  key: string;
  firstName: string;
  patronymic: string;
  lastName: string;
  relation: string;
  birthYear: string;
  deathYear?: string;
  gender?: "m" | "f";
  notes: string;
  parentKeys: string[];
  spouseKey?: string;
  spouseStatus?: "married" | "divorced" | "partners";
  unionFrom?: string;
  unionTo?: string;
};

/**
 * Переводит дерево из GED в людей, отношения считаем от выбранного «Я».
 * Подпись родства – из kinship (мама, бабушка, дядя и т.д.), без скобок со степенью.
 */
export function gedToPeople(tree: TreeData, selfKey: string): ImportedPerson[] {
  const statusOf = (s: string): ImportedPerson["spouseStatus"] => (s === "divorced" ? "divorced" : s === "partner" ? "partners" : "married");
  const spouseOf = new Map<string, { key: string; status: ImportedPerson["spouseStatus"]; from: string; to: string }>();
  const parentsOf = new Map<string, string[]>();
  for (const u of tree.unions) {
    if (u.partnerIds.length === 2) {
      const [a, b] = u.partnerIds as [string, string];
      const st = statusOf(u.status);
      spouseOf.set(a, { key: b, status: st, from: u.startYear, to: u.endYear });
      spouseOf.set(b, { key: a, status: st, from: u.startYear, to: u.endYear });
    }
    for (const c of u.childIds) parentsOf.set(c, [...(parentsOf.get(c) ?? []), ...u.partnerIds].slice(0, 2));
  }
  return tree.people.map((p) => {
    const k = kinship(tree.people, tree.unions, selfKey, p.id);
    const relation = p.id === selfKey ? "я" : k.title;
    const sp = spouseOf.get(p.id);
    return {
      key: p.id,
      firstName: p.firstName,
      patronymic: p.patronymic,
      lastName: p.lastName,
      relation,
      birthYear: p.birthYear,
      deathYear: p.deathYear || undefined,
      gender: p.gender === "m" || p.gender === "f" ? p.gender : undefined,
      notes: p.note,
      parentKeys: parentsOf.get(p.id) ?? [],
      spouseKey: sp?.key,
      spouseStatus: sp?.status,
      unionFrom: sp?.from || undefined,
      unionTo: sp?.to || undefined,
    };
  });
}
