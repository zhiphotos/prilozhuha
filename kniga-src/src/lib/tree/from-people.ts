import type { Person as RodPerson } from "@/lib/rod/types";
import type { Gender, Person, TreeData, Union, UnionStatus } from "./types.ts";

export const SELF_ID = "__self";

type Role = "self" | "mother" | "father" | "grand" | "greatgrand" | "uncle" | "sibling" | "child" | "grandchild" | "spouse" | "other";

/** Роль человека по тексту «кем приходится». */
export function roleOf(relation: string): Role {
  const r = relation.trim().toLowerCase();
  if (/^(я|сам|сама)$/.test(r)) return "self";
  if (/^(мам|мат)/.test(r)) return "mother";
  if (/^(пап|отец|отц)/.test(r)) return "father";
  if (/^пра(бабуш|дед)/.test(r)) return "greatgrand";
  if (/^(бабуш|дед)/.test(r)) return "grand";
  if (/^(дяд|тёт|тет)/.test(r)) return "uncle";
  if (/^(брат|сестр|двоюрод)/.test(r)) return "sibling";
  if (/^(внук|внуч)/.test(r)) return "grandchild";
  if (/^(сын|дочь|дочк|ребён|ребен)/.test(r)) return "child";
  if (/^(муж|жена|супруг)/.test(r)) return "spouse";
  return "other";
}

function genderOf(p: RodPerson, role: Role): Gender {
  if (p.gender) return p.gender;
  const r = p.relation.trim().toLowerCase();
  if (/(мам|мат|бабуш|тёт|тет|сестр|дочь|дочк|внуч|жена)/.test(r)) return "f";
  if (/(пап|отец|дед|дяд|брат|сын|внук|муж)/.test(r)) return "m";
  void role;
  return "u";
}

const STATUS: Record<string, UnionStatus> = { married: "married", divorced: "divorced", partners: "partner" };

/**
 * Собирает данные нового древа из основного списка «Людей».
 * Источник правды остаётся список людей; древо только отражает его.
 * Ссылки `parents`, `siblingOf`, `spouse` главнее вывода по слову «кем приходится».
 */
export function treeFromPeople(people: RodPerson[], selfName = "Я"): TreeData {
  const out: Person[] = [
    { id: SELF_ID, firstName: selfName, patronymic: "", lastName: "", gender: "u", birthYear: "", deathYear: "", photo: "", note: "" },
  ];
  const known = new Set<string>([SELF_ID]);
  for (const p of people) {
    const role = roleOf(p.relation);
    const t = p.name.trim().split(/\s+/).filter(Boolean);
    const hasParts = p.firstName !== undefined || p.patronymic !== undefined || p.lastName !== undefined;
    const first = hasParts ? (p.firstName ?? "") : (t[0] ?? "");
    const middle = hasParts ? (p.patronymic ?? "") : t.length > 2 ? t.slice(1, -1).join(" ") : "";
    const last = hasParts ? (p.lastName ?? "") : t.length > 1 ? (t[t.length - 1] ?? "") : "";
    out.push({
      id: p.id,
      firstName: first.trim() || p.name.trim(),
      patronymic: middle.trim(),
      lastName: last.trim() || p.maidenName?.trim() || "",
      gender: genderOf(p, role),
      birthYear: p.birthYear ?? "",
      deathYear: p.deathYear ?? "",
      photo: p.photo ?? "",
      note: p.notes ?? "",
    });
    known.add(p.id);
  }
  const byId = new Map(out.map((p) => [p.id, p]));
  const unions: Union[] = [];
  let seq = 0;
  const unionFor = (partners: string[]): Union => {
    const key = [...partners].sort().join("|");
    let u = unions.find((x) => [...x.partnerIds].sort().join("|") === key);
    if (!u) {
      u = { id: `u${++seq}`, partnerIds: [...partners], childIds: [], status: "married", startYear: "", endYear: "" };
      unions.push(u);
    }
    return u;
  };
  const addChild = (partners: string[], child: string) => {
    const ids = partners.filter((id) => id !== child);
    if (!ids.length || unions.some((u) => u.childIds.includes(child))) return;
    unionFor(ids).childIds.push(child);
  };
  /** Мама/папа человека по линии: из списка или пустая заготовка. */
  const ghost = (kind: "mother" | "father", of: string): string => {
    const id = `__${kind}_${of}`;
    if (!byId.has(id)) {
      const m = kind === "mother";
      const g: Person = { id, firstName: m ? "Мама" : "Папа", patronymic: "", lastName: "", gender: m ? "f" : "m", birthYear: "", deathYear: "", photo: "", note: "" };
      out.push(g);
      byId.set(id, g);
    }
    return id;
  };
  const first = (role: Role, line?: "mom" | "dad") =>
    people.find((p) => roleOf(p.relation) === role && (!line || p.line === line))?.id;
  const mother = first("mother");
  const father = first("father");
  const mom = mother ?? undefined;
  const dad = father ?? undefined;
  const needParents = people.some((p) => roleOf(p.relation) === "sibling" && !p.parents?.length && !p.siblingOf);

  // Родители «меня»: мама и папа (если хоть один указан или нужны братья).
  if (mom || dad || needParents || people.some((p) => roleOf(p.relation) === "grand" || roleOf(p.relation) === "uncle")) {
    const m = mom ?? (dad || needParents ? ghost("mother", SELF_ID) : undefined);
    const f = dad ?? (mom || needParents ? ghost("father", SELF_ID) : undefined);
    const pair = [f, m].filter((x): x is string => Boolean(x));
    if (pair.length) addChild(pair, SELF_ID);
  }
  const parentOfSelf = unions.find((u) => u.childIds.includes(SELF_ID));
  const lineParent = (line?: "mom" | "dad"): string | undefined =>
    line === "mom" ? (parentOfSelf?.partnerIds.find((id) => byId.get(id)?.gender === "f") ?? mom)
      : line === "dad" ? (parentOfSelf?.partnerIds.find((id) => byId.get(id)?.gender === "m") ?? dad)
        : undefined;
  const lineGrandUnion = (line?: "mom" | "dad"): string[] | undefined => {
    const parent = lineParent(line);
    if (!parent) return undefined;
    const grands = people.filter((p) => roleOf(p.relation) === "grand" && p.line === line).map((p) => p.id);
    if (!grands.length) return undefined;
    const pair = grands.slice(0, 2);
    if (pair.length === 1) {
      // Один из двоих известен: рядом ставим пустое место, чтобы пара и линия читались.
      const known = byId.get(pair[0]!);
      const id = `__grand_${line}_${known?.gender === "f" ? "m" : "f"}`;
      if (!byId.has(id)) {
        const f = known?.gender === "f";
        const g: Person = { id, firstName: f ? "Дедушка" : "Бабушка", patronymic: "", lastName: "", gender: f ? "m" : "f", birthYear: "", deathYear: "", photo: "", note: "" };
        out.push(g);
        byId.set(id, g);
      }
      pair.push(id);
    }
    addChild(pair, parent);
    return pair;
  };

  for (const p of people) {
    const role = roleOf(p.relation);
    const explicit = (p.parents ?? []).filter((id) => known.has(id) && id !== p.id);
    if (explicit.length) { addChild(explicit.slice(0, 2), p.id); continue; }
    if (p.siblingOf && known.has(p.siblingOf)) {
      const other = unions.find((u) => u.childIds.includes(p.siblingOf!));
      if (other) { other.childIds.push(p.id); continue; }
    }
    if (role === "sibling" && parentOfSelf) addChild(parentOfSelf.partnerIds, p.id);
    else if (role === "child") {
      const spouse = p.parents?.length ? [] : [SELF_ID];
      addChild(spouse, p.id);
    } else if (role === "uncle") {
      const g = lineGrandUnion(p.line);
      if (g) addChild(g, p.id);
    }
  }
  for (const p of people) if (roleOf(p.relation) === "grand" || roleOf(p.relation) === "uncle") void lineGrandUnion(p.line);
  // «Мама бабушки» и пр.: прабабушки/прадедушки привязываем к бабушке/дедушке своей линии.
  for (const line of ["mom", "dad"] as const) {
    const gg = people.filter((p) => roleOf(p.relation) === "greatgrand" && p.line === line);
    const grand = people.find((p) => roleOf(p.relation) === "grand" && p.line === line);
    if (gg.length && grand) addChild(gg.slice(0, 2).map((p) => p.id), grand.id);
  }
  // Супруги.
  for (const p of people) {
    if (!p.spouse || !known.has(p.spouse)) continue;
    const u = unionFor([p.id, p.spouse]);
    u.status = STATUS[p.spouseStatus ?? "married"] ?? "married";
    if (p.unionFrom) u.startYear = p.unionFrom;
    if (p.unionTo) u.endYear = p.unionTo;
  }
  const spouseOfSelf = people.find((p) => roleOf(p.relation) === "spouse");
  if (spouseOfSelf && !unions.some((u) => u.partnerIds.includes(spouseOfSelf.id))) unionFor([SELF_ID, spouseOfSelf.id]);
  // Дети, у которых есть супруг «меня», уходят в общий союз.
  if (spouseOfSelf) {
    const solo = unions.find((u) => u.partnerIds.length === 1 && u.partnerIds[0] === SELF_ID);
    const pair = unions.find((u) => u.partnerIds.includes(SELF_ID) && u.partnerIds.includes(spouseOfSelf.id));
    if (solo && pair) { pair.childIds.push(...solo.childIds); unions.splice(unions.indexOf(solo), 1); }
  }
  return { people: out, unions, focusId: SELF_ID };
}
