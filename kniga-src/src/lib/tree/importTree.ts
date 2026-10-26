import type { Gender, Person, TreeData, Union, UnionStatus } from "./types.ts";

type RawPerson = {
  id?: string;
  firstName?: string;
  patronymic?: string;
  lastName?: string;
  gender?: string;
  birthYear?: string;
  deathYear?: string;
  note?: string;
};

type RawUnion = {
  id?: string;
  partnerIds?: string[];
  childIds?: string[];
  status?: string;
  startYear?: string;
  endYear?: string;
};

export type RawTree = {
  people?: RawPerson[];
  unions?: RawUnion[];
  focusId?: string;
};

const MAX_PEOPLE = 5000;

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function yearOf(value: unknown): string {
  const match = clean(value).match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return match?.[1] ?? "";
}

function genderOf(value: unknown): Gender {
  const v = clean(value).toLowerCase();
  if (v === "m" || v === "male" || v === "м" || v.startsWith("муж")) return "m";
  if (v === "f" || v === "female" || v === "ж" || v.startsWith("жен")) return "f";
  return "u";
}

function statusOf(value: unknown): UnionStatus {
  const v = clean(value).toLowerCase();
  if (v.includes("div") || v.includes("разв")) return "divorced";
  if (v.includes("wid") || v.includes("вдов")) return "widowed";
  if (v.includes("part") || v.includes("союз")) return "partner";
  return "married";
}

function slug(value: string, index: number): string {
  const base = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  return base || `p${index + 1}`;
}

export function treeFromExtract(raw: RawTree): { tree: TreeData } | { error: string } {
  const source = Array.isArray(raw.people) ? raw.people.slice(0, MAX_PEOPLE) : [];
  const used = new Set<string>();
  const people: Person[] = [];
  source.forEach((item, index) => {
    const firstName = clean(item.firstName);
    const patronymic = clean(item.patronymic);
    const lastName = clean(item.lastName);
    if (!firstName && !lastName) return;
    let id = slug(clean(item.id), index);
    while (used.has(id)) id = `${id}${index}`;
    used.add(id);
    people.push({
      id,
      firstName: firstName || "Без имени",
      patronymic,
      lastName,
      gender: genderOf(item.gender),
      birthYear: yearOf(item.birthYear),
      deathYear: yearOf(item.deathYear),
      photo: "",
      note: clean(item.note).slice(0, 280),
    });
  });
  if (!people.length) return { error: "В файле не нашлось ни одного человека" };
  const ids = new Set(people.map((p) => p.id));
  const unions: Union[] = [];
  const seen = new Set<string>();
  (raw.unions ?? []).forEach((item, index) => {
    const partnerIds = [...new Set((item.partnerIds ?? []).map(clean).filter((id) => ids.has(id)))].slice(0, 2);
    const childIds = [...new Set((item.childIds ?? []).map(clean).filter((id) => ids.has(id) && !partnerIds.includes(id)))];
    if (partnerIds.length + childIds.length < 2) return;
    const key = `${partnerIds.slice().sort().join("+")}|${childIds.slice().sort().join("+")}`;
    if (seen.has(key)) return;
    seen.add(key);
    unions.push({
      id: slug(clean(item.id) || `u${index + 1}`, index),
      partnerIds,
      childIds,
      status: statusOf(item.status),
      startYear: yearOf(item.startYear),
      endYear: yearOf(item.endYear),
    });
  });
  const focusId = raw.focusId && ids.has(raw.focusId) ? raw.focusId : busiest(people, unions);
  return { tree: { people, unions, focusId } };
}

function busiest(people: Person[], unions: Union[]): string {
  const score = new Map(people.map((p) => [p.id, 0]));
  for (const union of unions) {
    for (const id of [...union.partnerIds, ...union.childIds]) score.set(id, (score.get(id) ?? 0) + 1);
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? people[0]!.id;
}

type GedNode = { tag: string; xref: string; value: string; children: GedNode[] };

function gedRecords(text: string): GedNode[] {
  const roots: GedNode[] = [];
  const stack: { level: number; node: GedNode }[] = [];
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const match = raw.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    if (!match) continue;
    const level = Number(match[1]);
    const tag = match[3]!.toUpperCase();
    const value = (match[4] ?? "").trim();
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    const parent = stack[stack.length - 1]?.node;
    if ((tag === "CONC" || tag === "CONT") && parent) {
      parent.value += tag === "CONT" ? `\n${value}` : value;
      continue;
    }
    const node: GedNode = { tag, xref: (match[2] ?? "").replace(/@/g, ""), value, children: [] };
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push({ level, node });
  }
  return roots;
}

function child(node: GedNode, tag: string): GedNode | undefined {
  return node.children.find((item) => item.tag === tag);
}

function eventYear(record: GedNode, tag: string): string {
  const event = child(record, tag);
  if (!event) return "";
  return yearOf(child(event, "DATE")?.value ?? event.value);
}

function splitGedName(value: string): { firstName: string; patronymic: string; lastName: string } {
  const match = value.match(/^(.*?)(?:\/([^/]*)\/)?\s*$/);
  const given = clean(match?.[1]).split(" ").filter(Boolean);
  return { firstName: given[0] ?? "", patronymic: given.slice(1).join(" "), lastName: clean(match?.[2]) };
}

export function parseGedcom(text: string): { tree: TreeData } | { error: string } {
  const records = gedRecords(text);
  const people: RawPerson[] = [];
  const unions: RawUnion[] = [];
  for (const record of records) {
    if (record.tag === "INDI" && record.xref) {
      const name = splitGedName(child(record, "NAME")?.value ?? record.value);
      const sex = child(record, "SEX")?.value ?? "";
      people.push({
        id: record.xref,
        ...name,
        gender: sex,
        birthYear: eventYear(record, "BIRT"),
        deathYear: eventYear(record, "DEAT"),
        note: clean(child(record, "NOTE")?.value).slice(0, 280),
      });
    }
    if (record.tag === "FAM" && record.xref) {
      const partners = [child(record, "HUSB")?.value, child(record, "WIFE")?.value].map((id) => clean(id).replace(/@/g, "")).filter(Boolean);
      const kids = record.children.filter((item) => item.tag === "CHIL").map((item) => item.value.replace(/@/g, ""));
      const divorced = record.children.some((item) => item.tag === "DIV");
      unions.push({
        id: record.xref,
        partnerIds: partners,
        childIds: kids,
        status: divorced ? "divorced" : "married",
        startYear: eventYear(record, "MARR"),
        endYear: eventYear(record, "DIV"),
      });
    }
  }
  if (!people.length) return { error: "В GEDCOM нет людей" };
  return treeFromExtract({ people, unions });
}
