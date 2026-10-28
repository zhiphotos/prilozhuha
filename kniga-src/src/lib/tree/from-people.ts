import type { Person as RodPerson } from "@/lib/rod/types";
import type { Gender, Person, TreeData, Union, UnionStatus } from "./types.ts";

export const SELF_ID = "__self";

type Role = "self" | "spousesib" | "mother" | "father" | "grand" | "greatgrand" | "uncle" | "sibling" | "child" | "grandchild" | "spouse" | "other";

/** «Брат мужа», «сестра жены», «родной брат супруга»: родной человек супруга, а не мой. */
export function spouseSiblingWord(r: string): boolean {
  return /(брат|сестр)\S*\s+(мужа|жены|супруг)/.test(r.trim().toLowerCase());
}

/** Роль человека по тексту «кем приходится». */
export function roleOf(relation: string): Role {
  const r = relation.trim().toLowerCase();
  if (/^(я|сам|сама)$/.test(r)) return "self";
  if (spouseSiblingWord(r)) return "spousesib";
  if (/^(мам|мат)/.test(r)) return "mother";
  if (/^(пап|отец|отц)/.test(r)) return "father";
  if (/^(пра)+(бабуш|дед)/.test(r) || /^предок/.test(r)) return "greatgrand";
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
  if (role === "spousesib") return /сестр/.test(r.split(/\s+/).find((w) => /(брат|сестр)/.test(w)) ?? "") ? "f" : "m";
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
  // Если в списке есть запись «я», центром древа становится она сама, а запасное «Я» не создаётся (иначе человек двоится).
  const selfRec = people.find((p) => roleOf(p.relation) === "self");
  const selfId = selfRec?.id ?? SELF_ID;
  const out: Person[] = selfRec
    ? []
    : [{ id: SELF_ID, firstName: selfName, patronymic: "", lastName: "", gender: "u", birthYear: "", deathYear: "", photo: "", note: "" }];
  const known = new Set<string>([selfId]);
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
      maidenName: last.trim() && p.maidenName?.trim() && p.maidenName.trim().toLowerCase() !== last.trim().toLowerCase() ? p.maidenName.trim() : undefined,
      side: p.treeSide,
      rank: p.treeRank,
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
  const needParents = people.some((p) => !p.fromFile && roleOf(p.relation) === "sibling" && !p.parents?.length && !p.siblingOf);

  // Родители «меня»: мама и папа (если хоть один указан или нужны братья).
  const selfHasParents = Boolean(selfRec?.parents?.some((id) => known.has(id) && id !== selfId));
  if (!selfHasParents && (mom || dad || needParents || people.some((p) => roleOf(p.relation) === "grand" || roleOf(p.relation) === "uncle"))) {
    const m = mom ?? (dad || needParents ? ghost("mother", selfId) : undefined);
    const f = dad ?? (mom || needParents ? ghost("father", selfId) : undefined);
    const pair = [f, m].filter((x): x is string => Boolean(x));
    if (pair.length) addChild(pair, selfId);
  }
  const parentOfSelf = unions.find((u) => u.childIds.includes(selfId));
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
    // Брат или сестра не бывают моим ребёнком: если в «Чей ребёнок» выбран я, потомок или ещё брат, связь игнорируем (читаем по слову «кем приходится»).
    const badKin = new Set<Role>(["self", "child", "grandchild", "sibling"]);
    const explicit = (p.parents ?? []).filter((id) => known.has(id) && id !== p.id && !(!p.fromFile && role === "sibling" && badKin.has(roleOf(people.find((q) => q.id === id)?.relation ?? "")) ));
    if (explicit.length) { addChild(explicit.slice(0, 2), p.id); continue; }
    if (p.siblingOf && known.has(p.siblingOf)) {
      let other = unions.find((u) => u.childIds.includes(p.siblingOf!));
      if (!other && !p.fromFile && !(people.find((q) => q.id === p.siblingOf)?.parents ?? []).length) {
        // У того, чей это брат или сестра, родителей пока нет: рядом появляются пустые «Мама» и «Папа», общие для обоих.
        addChild([ghost("father", p.siblingOf), ghost("mother", p.siblingOf)], p.siblingOf);
        other = unions.find((u) => u.childIds.includes(p.siblingOf!));
      }
      if (other) { other.childIds.push(p.id); continue; }
    }
    if (p.fromFile) continue;
    if (role === "sibling" && parentOfSelf) addChild(parentOfSelf.partnerIds, p.id);
    else if (role === "child") {
      const spouse = p.parents?.length ? [] : [selfId];
      addChild(spouse, p.id);
    } else if (role === "uncle") {
      const g = lineGrandUnion(p.line);
      if (g) addChild(g, p.id);
    }
  }
  for (const p of people) if (roleOf(p.relation) === "grand" || roleOf(p.relation) === "uncle") void lineGrandUnion(p.line);
  // Братья и сёстры супруга: встают в ветку мужа или жены, рядом с ним (у супруга при необходимости появляются «Мама» и «Папа»).
  const mateOfSelf = people.find((p) => !p.fromFile && roleOf(p.relation) === "spouse");
  if (mateOfSelf) {
    for (const p of people) {
      if (roleOf(p.relation) !== "spousesib" || (p.parents ?? []).length || p.siblingOf) continue;
      let parentUnion = unions.find((u) => u.childIds.includes(mateOfSelf.id));
      if (!parentUnion) {
        const m = ghost("mother", mateOfSelf.id);
        const f = ghost("father", mateOfSelf.id);
        addChild([f, m], mateOfSelf.id);
        parentUnion = unions.find((u) => u.childIds.includes(mateOfSelf.id));
      }
      if (parentUnion && !unions.some((u) => u.childIds.includes(p.id))) parentUnion.childIds.push(p.id);
    }
  }
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
  // Остальные браки (второй, третий супруг).
  for (const p of people) {
    for (const m of p.moreSpouses ?? []) {
      if (!known.has(m.id)) continue;
      const u = unionFor([p.id, m.id]);
      u.status = STATUS[m.status ?? "married"] ?? "married";
      if (m.from) u.startYear = m.from;
      if (m.to) u.endYear = m.to;
    }
  }
  const spouseOfSelf = people.find((p) => !p.fromFile && roleOf(p.relation) === "spouse") ?? people.find((p) => roleOf(p.relation) === "spouse" && p.spouse === selfId);
  if (spouseOfSelf && !unions.some((u) => u.partnerIds.includes(spouseOfSelf.id))) unionFor([selfId, spouseOfSelf.id]);
  // Дети, у которых есть супруг «меня», уходят в общий союз.
  // Для людей из файла связи точные: ребёнок с одним родителем остаётся с одним (жена бывает второй, а не мать).
  if (spouseOfSelf && !selfRec?.fromFile) {
    const solo = unions.find((u) => u.partnerIds.length === 1 && u.partnerIds[0] === selfId);
    const pair = unions.find((u) => u.partnerIds.includes(selfId) && u.partnerIds.includes(spouseOfSelf.id));
    if (solo && pair) { pair.childIds.push(...solo.childIds); unions.splice(unions.indexOf(solo), 1); }
  }
  return { people: out, unions, focusId: selfId };
}
