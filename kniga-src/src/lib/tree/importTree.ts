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
  maidenName?: string;
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
  /** GEDCOM: человек без имени, но со связями остаётся карточкой «Без имени». У ИИ-разбора выдуманные пустые строки отбрасываются. */
  keepNameless?: boolean;
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

import { normalizeDate } from "./date-parse.ts";

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
  const referenced = new Set<string>();
  for (const u of raw.unions ?? []) for (const id of [...(u.partnerIds ?? []), ...(u.childIds ?? [])]) referenced.add(clean(id));
  source.forEach((item, index) => {
    const firstName = clean(item.firstName);
    const patronymic = clean(item.patronymic);
    const lastName = clean(item.lastName);
    // Человек без имени остаётся, если у него есть связи (пустая карточка «Без имени» держит ветку), иначе пропускаем.
    if (!firstName && !lastName && !(raw.keepNameless && referenced.has(clean(item.id)))) return;
    let id = slug(clean(item.id), index);
    while (used.has(id)) id = `${id}${index}`;
    used.add(id);
    people.push({
      id,
      firstName: firstName || "Без имени",
      patronymic,
      lastName,
      gender: genderOf(item.gender),
      birthYear: normalizeDate(item.birthYear),
      deathYear: normalizeDate(item.deathYear),
      photo: "",
      note: clean(item.note).slice(0, 6000),
      maidenName: clean(item.maidenName) || undefined,
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
  for (const raw of text.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)) {
    const match = raw.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?([A-Za-z0-9_]+)(?:\s(.*))?$/);
    if (!match) continue;
    const level = Number(match[1]);
    const tag = match[3]!.toUpperCase();
    const value = (match[4] ?? "").trim();
    while (stack.length && stack[stack.length - 1]!.level >= level) stack.pop();
    const parent = stack[stack.length - 1]?.node;
    if ((tag === "CONC" || tag === "CONT") && parent) {
      const glue = tag === "CONT" || /[.!?)»"…]$/.test(parent.value) ? "\n" : "";
      parent.value += glue + value;
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

/** Полная дата события (день, месяц, год), если она есть в файле. */
function eventDate(record: GedNode, tag: string): string {
  const event = child(record, tag);
  if (!event) return "";
  return normalizeDate(child(event, "DATE")?.value ?? event.value);
}

/** Девичья фамилия: в GED у замужних в имени стоит фамилия мужа, а своя лежит в SURN. */
function maidenOf(record: GedNode, married: string): string | undefined {
  const nameNode = child(record, "NAME");
  const surn = clean(nameNode ? child(nameNode, "SURN")?.value : "");
  const marnm = clean(nameNode ? child(nameNode, "_MARNM")?.value : "");
  if (surn && marnm && surn.toLowerCase() !== marnm.toLowerCase()) return surn;
  if (surn && married && surn.toLowerCase() !== married.toLowerCase()) return surn;
  return undefined;
}

const EVENT_TITLES: Record<string, string> = {
  Burial: "Похоронен(а)",
  Christening: "Крещение",
  Education: "Образование",
  MilitaryService: "Служба",
  MilitaryAward: "Награда",
};

/** Всё, что есть о человеке кроме имени и дат: место рождения, жизнь, события и комментарии, одним текстом. */
function biography(record: GedNode): string {
  const lines: string[] = [];
  const push = (label: string, ...parts: (string | undefined)[]) => {
    const text = parts.map((x) => clean(x)).filter(Boolean).join(", ");
    if (text) lines.push(label ? `${label}: ${text}` : text);
  };
  const birt = child(record, "BIRT");
  if (birt) push("Место рождения", child(birt, "PLAC")?.value);
  if (birt && child(birt, "NOTE")) push("", child(birt, "NOTE")?.value);
  const deat = child(record, "DEAT");
  if (deat) push("Место ухода", child(deat, "PLAC")?.value, child(deat, "CAUS")?.value);
  for (const node of record.children) {
    if (node.tag === "NOTE") push("", node.value);
    else if (node.tag === "OCCU") push("Занятие", node.value, child(node, "NOTE")?.value);
    else if (node.tag === "RESI") push("Жил(а)", child(node, "ADDR")?.value, child(node, "PLAC")?.value, child(node, "NOTE")?.value);
    else if (node.tag === "EVEN") {
      const type = clean(child(node, "TYPE")?.value);
      const body = [node.value, child(node, "NOTE")?.value];
      if (type === "Marriage" || type === "Divorce") continue;
      if (type === "Comment" || !type) push("", ...body);
      else push(EVENT_TITLES[type] ?? type, child(node, "DATE")?.value, child(node, "PLAC")?.value, ...body);
    }
  }
  return lines.join("\n").slice(0, 6000);
}

/** Дата брака или развода: бывает в MARR/DIV, а бывает в событии EVEN с типом Marriage/Divorce. */
function famDate(record: GedNode, tag: string, type: string): string {
  const direct = eventDate(record, tag);
  if (direct) return direct;
  const even = record.children.find((item) => item.tag === "EVEN" && clean(child(item, "TYPE")?.value) === type);
  return even ? normalizeDate(child(even, "DATE")?.value ?? "") : "";
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
        birthYear: eventDate(record, "BIRT"),
        deathYear: eventDate(record, "DEAT"),
        note: biography(record),
        maidenName: maidenOf(record, name.lastName),
      });
    }
    if (record.tag === "FAM" && record.xref) {
      const partners = [child(record, "HUSB")?.value, child(record, "WIFE")?.value].map((id) => clean(id).replace(/@/g, "")).filter(Boolean);
      const kids = record.children.filter((item) => item.tag === "CHIL").map((item) => item.value.replace(/@/g, ""));
      const divorced = record.children.some((item) => item.tag === "DIV" || (item.tag === "EVEN" && clean(child(item, "TYPE")?.value) === "Divorce"));
      unions.push({
        id: record.xref,
        partnerIds: partners,
        childIds: kids,
        status: divorced ? "divorced" : "married",
        startYear: famDate(record, "MARR", "Marriage"),
        endYear: famDate(record, "DIV", "Divorce"),
      });
    }
  }
  if (!people.length) return { error: "В GEDCOM нет людей" };
  return treeFromExtract({ people, unions, keepNameless: true });
}
