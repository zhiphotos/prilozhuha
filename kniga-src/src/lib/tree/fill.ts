import type { Gender, Person, TreeData, Union, UnionStatus } from "./types.ts";

export type RelKind = "father" | "mother" | "spouse" | "son" | "daughter" | "brother" | "sister";

export type NewPerson = {
  firstName: string;
  patronymic: string;
  lastName: string;
  gender: Gender;
  birthYear: string;
  deathYear: string;
  note: string;
  photo: string;
};

export type UnionFacts = {
  startYear?: string;
  endYear?: string;
  status?: UnionStatus;
};

export type SlotInput = {
  firstName: string;
  patronymic?: string;
  lastName?: string;
  gender?: Gender;
  birthYear?: string;
  deathYear?: string;
};

export type StarterInput = {
  self: SlotInput & { gender: Gender };
  father?: SlotInput | null;
  mother?: SlotInput | null;
  paternalGrandfather?: SlotInput | null;
  paternalGrandmother?: SlotInput | null;
  maternalGrandfather?: SlotInput | null;
  maternalGrandmother?: SlotInput | null;
};

export type FamilyView = {
  father?: Person;
  mother?: Person;
  /** Сколько родителей уже стоит в схеме (приложение хранит не больше двух). */
  parentCount: number;
  marriages: { union: Union; spouse?: Person; children: Person[] }[];
  siblings: Person[];
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function year(value?: string): string {
  return (value ?? "").replace(/\D/g, "").slice(0, 4);
}

export function inflectSurname(lastName: string, gender: Gender): string {
  const name = lastName.trim();
  if (!name || gender === "u") return name;
  if (gender === "m") {
    if (/(ова|ева|ёва|ина|ына)$/i.test(name)) return name.slice(0, -1);
    return name;
  }
  if (/(ов|ев|ёв|ин|ын)$/i.test(name)) return `${name}а`;
  return name;
}

export function namedSlot(slot?: SlotInput | null): slot is SlotInput {
  return Boolean(slot && slot.firstName.trim());
}

function clone(data: TreeData): TreeData {
  return {
    focusId: data.focusId,
    people: data.people.map((p) => ({ ...p })),
    unions: data.unions.map((u) => ({ ...u, partnerIds: [...u.partnerIds], childIds: [...u.childIds] })),
  };
}

function makePerson(slot: SlotInput, gender: Gender, id = uid()): Person {
  return {
    id,
    firstName: slot.firstName.trim(),
    patronymic: (slot.patronymic ?? "").trim(),
    lastName: (slot.lastName ?? "").trim(),
    gender: slot.gender && slot.gender !== "u" ? slot.gender : gender,
    birthYear: year(slot.birthYear),
    deathYear: year(slot.deathYear),
    photo: "",
    note: "",
  };
}

function pushUnion(unions: Union[], partners: Person[], children: Person[]) {
  if (!partners.length && !children.length) return;
  unions.push({
    id: uid(),
    partnerIds: partners.map((p) => p.id),
    childIds: children.map((p) => p.id),
    status: "married",
    startYear: "",
    endYear: "",
  });
}

/** MyHeritage-style opening: you, then parents, then the four grandparents you know. */
export function buildStarter(input: StarterInput): TreeData {
  const people: Person[] = [];
  const unions: Union[] = [];
  const self = makePerson(input.self, input.self.gender || "u", "self");
  people.push(self);
  const father = namedSlot(input.father) ? makePerson(input.father, "m") : null;
  const mother = namedSlot(input.mother) ? makePerson(input.mother, "f") : null;
  if (father) people.push(father);
  if (mother) people.push(mother);
  if (father) {
    const grandfather = namedSlot(input.paternalGrandfather) ? makePerson(input.paternalGrandfather, "m") : null;
    const grandmother = namedSlot(input.paternalGrandmother) ? makePerson(input.paternalGrandmother, "f") : null;
    if (grandfather) people.push(grandfather);
    if (grandmother) people.push(grandmother);
    if (grandfather || grandmother) pushUnion(unions, [grandfather, grandmother].filter((p): p is Person => Boolean(p)), [father]);
  }
  if (mother) {
    const grandfather = namedSlot(input.maternalGrandfather) ? makePerson(input.maternalGrandfather, "m") : null;
    const grandmother = namedSlot(input.maternalGrandmother) ? makePerson(input.maternalGrandmother, "f") : null;
    if (grandfather) people.push(grandfather);
    if (grandmother) people.push(grandmother);
    if (grandfather || grandmother) pushUnion(unions, [grandfather, grandmother].filter((p): p is Person => Boolean(p)), [mother]);
  }
  if (father || mother) pushUnion(unions, [father, mother].filter((p): p is Person => Boolean(p)), [self]);
  return { people, unions, focusId: self.id };
}

function kidsOf(unions: Union[], id: string): string[] {
  const out: string[] = [];
  for (const u of unions) {
    if (!u.partnerIds.includes(id)) continue;
    for (const c of u.childIds) if (!out.includes(c)) out.push(c);
  }
  return out;
}

function parentsOf(unions: Union[], id: string): string[] {
  const u = unions.find((x) => x.childIds.includes(id));
  return u?.partnerIds ?? [];
}

function walk(unions: Union[], id: string, next: (unions: Union[], cur: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const q = [...next(unions, id)];
  while (q.length) {
    const cur = q.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    q.push(...next(unions, cur));
  }
  return seen;
}

function directLine(unions: Union[], a: string, b: string): boolean {
  return walk(unions, a, parentsOf).has(b) || walk(unions, a, kidsOf).has(b);
}

function forcedGender(kind: RelKind): Gender | null {
  if (kind === "father" || kind === "son" || kind === "brother") return "m";
  if (kind === "mother" || kind === "daughter" || kind === "sister") return "f";
  return null;
}

function birthUnion(unions: Union[], childId: string): Union {
  const host = unions.find((u) => u.childIds.includes(childId));
  if (host) return host;
  const created: Union = { id: uid(), partnerIds: [], childIds: [childId], status: "married", startYear: "", endYear: "" };
  unions.push(created);
  return created;
}

function place(
  data: TreeData,
  fromId: string,
  personId: string,
  kind: RelKind,
  chosenUnion?: string,
  facts?: UnionFacts,
): string | null {
  const unions = data.unions;
  if (directLine(unions, fromId, personId)) return "Так род зациклится: это прямой предок или потомок";
  if (kind === "father" || kind === "mother") {
    const host = unions.find((u) => u.childIds.includes(fromId));
    if (host?.childIds.includes(personId)) return "Брат или сестра не становится родителем";
    const birth = birthUnion(unions, fromId);
    if (birth.partnerIds.includes(personId)) return "Уже записан родителем";
    if (birth.partnerIds.length >= 2) return "Оба родителя уже есть";
    const gender = kind === "father" ? "m" : "f";
    const taken = birth.partnerIds.some((id) => data.people.find((p) => p.id === id)?.gender === gender);
    if (taken) return kind === "father" ? "Отец уже записан" : "Мать уже записана";
    birth.partnerIds.push(personId);
    birth.partnerIds.sort((a, b) => {
      const rank = (id: string) => {
        const g = data.people.find((p) => p.id === id)?.gender;
        return g === "m" ? 0 : g === "f" ? 1 : 2;
      };
      return rank(a) - rank(b);
    });
    return null;
  }
  if (kind === "spouse") {
    const birth = unions.find((u) => u.childIds.includes(fromId));
    if (birth?.childIds.includes(personId)) return "Брат или сестра не записывается супругом";
    if (unions.some((u) => u.partnerIds.includes(fromId) && u.partnerIds.includes(personId))) return "Этот брак уже есть";
    unions.push({
      id: uid(),
      partnerIds: [fromId, personId],
      childIds: [],
      status: facts?.status ?? "married",
      startYear: year(facts?.startYear),
      endYear: year(facts?.endYear),
    });
    return null;
  }
  if (kind === "son" || kind === "daughter") {
    const mine = unions.filter((u) => u.partnerIds.includes(fromId));
    let host = chosenUnion ? mine.find((u) => u.id === chosenUnion) : mine.length === 1 ? mine[0] : undefined;
    if (!host && mine.length > 1) return "Выберите, в какой семье ребёнок";
    if (!host) {
      host = { id: uid(), partnerIds: [fromId], childIds: [], status: "married", startYear: "", endYear: "" };
      unions.push(host);
    }
    if (unions.some((u) => u.partnerIds.includes(fromId) && u.partnerIds.includes(personId))) return "Супруг не записывается ребёнком";
    if (host.childIds.includes(personId)) return "Уже в этой семье";
    const other = unions.find((u) => u !== host && u.childIds.includes(personId));
    if (other) return "У этого человека уже есть родители";
    host.childIds.push(personId);
    return null;
  }
  const birth = birthUnion(unions, fromId);
  if (birth.childIds.includes(personId)) return "Уже брат или сестра";
  if (birth.partnerIds.includes(personId)) return "Родитель не становится братом";
  if (unions.some((u) => u.partnerIds.includes(fromId) && u.partnerIds.includes(personId))) return "Супруг не становится братом";
  const other = unions.find((u) => u !== birth && u.childIds.includes(personId));
  if (other) return "У этого человека уже есть родители";
  birth.childIds.push(personId);
  return null;
}

export function addPerson(
  data: TreeData,
  fromId: string,
  kind: RelKind,
  draft: NewPerson,
  chosenUnion?: string,
  facts?: UnionFacts,
): { data: TreeData; id: string } | { error: string } {
  if (!draft.firstName.trim()) return { error: "Введите имя" };
  if (!data.people.some((p) => p.id === fromId)) return { error: "Нет такого человека" };
  const next = clone(data);
  const gender = forcedGender(kind) ?? draft.gender;
  const person = makePerson({ ...draft, gender }, gender);
  person.note = draft.note;
  person.photo = draft.photo;
  next.people.push(person);
  const error = place(next, fromId, person.id, kind, chosenUnion, facts);
  if (error) return { error };
  return { data: next, id: person.id };
}

export function attachPerson(
  data: TreeData,
  fromId: string,
  kind: RelKind,
  existingId: string,
  chosenUnion?: string,
  facts?: UnionFacts,
): { data: TreeData; id: string } | { error: string } {
  if (fromId === existingId) return { error: "Нельзя связать человека с самим собой" };
  const next = clone(data);
  const person = next.people.find((p) => p.id === existingId);
  if (!person || !next.people.some((p) => p.id === fromId)) return { error: "Нет такого человека" };
  const gender = forcedGender(kind);
  if (gender && person.gender !== "u" && person.gender !== gender) {
    return { error: gender === "m" ? "В этой роли нужен мужчина" : "В этой роли нужна женщина" };
  }
  if (gender && person.gender === "u") person.gender = gender;
  const error = place(next, fromId, existingId, kind, chosenUnion, facts);
  if (error) return { error };
  return { data: next, id: existingId };
}

export function familyOf(people: Person[], unions: Union[], personId: string): FamilyView {
  const byId = new Map(people.map((p) => [p.id, p]));
  const birth = unions.find((u) => u.childIds.includes(personId));
  const folks = (birth?.partnerIds ?? []).map((id) => byId.get(id)).filter((p): p is Person => Boolean(p));
  const unknown = folks.filter((p) => p.gender === "u");
  const father = folks.find((p) => p.gender === "m") ?? unknown[0];
  const mother = folks.find((p) => p.gender === "f") ?? unknown.find((p) => p !== father);
  const siblings = (birth?.childIds ?? [])
    .filter((id) => id !== personId)
    .map((id) => byId.get(id))
    .filter((p): p is Person => Boolean(p));
  const marriages = unions
    .filter((u) => u.partnerIds.includes(personId))
    .map((union) => ({
      union,
      spouse: union.partnerIds.map((id) => byId.get(id)).find((p): p is Person => Boolean(p && p.id !== personId)),
      children: union.childIds.map((id) => byId.get(id)).filter((p): p is Person => Boolean(p)),
    }));
  return { father, mother, parentCount: folks.length, marriages, siblings };
}
