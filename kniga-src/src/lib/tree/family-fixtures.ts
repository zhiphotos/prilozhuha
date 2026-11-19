// Общие данные для тестов прототипной раскладки (не тест: импорт отсюда не запускает чужие тесты повторно).
import { readFileSync } from "node:fs";
import type { Person as RodPerson } from "../rod/types.ts";
import type { layoutFamily } from "./family-layout.ts";
import type { layoutTree } from "./layout.ts";
import type { treeFromPeople } from "./from-people.ts";
import type { Person, Union } from "./types.ts";

export const person = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "", ...extra });
export const union = (id: string, partners: string[], kids: string[] = []): Union => ({ id, partnerIds: partners, childIds: kids, status: "married", startYear: "", endYear: "" });

export function annaPeople(): RodPerson[] {
  const raw = readFileSync(new URL("./fixtures/anna-compact-1119.txt", import.meta.url), "utf8").trim();
  return raw.split(";").map((row) => {
    const [id, g, par, sp, more, side, rel, st] = row.split(",") as string[];
    return {
      id: id!, name: id!, relation: rel!, maidenName: "", notes: "", birthYear: "",
      gender: g as "m" | "f",
      parents: par ? par.split("+") : undefined,
      spouse: sp || undefined,
      moreSpouses: more ? more.split("+").map((m) => ({ id: m, status: "married" as const })) : undefined,
      spouseStatus: st === "married" ? "married" : undefined,
      treeSide: side === "left" || side === "right" ? side : undefined,
    } as RodPerson;
  });
}

/** 20 человек: пара, её родители и дедушка с бабушкой по маме, дядя с двумя детьми, брат с женой и ребёнком, родители мужа, двое детей пары, у старшей муж и внук. */
export function small() {
  const people = [
    person("жена", "f"), person("муж", "m"),
    person("отец", "m"), person("мать", "f"), person("дедМ", "m"), person("бабМ", "f"),
    person("дядя", "m"), person("жена_дяди", "f"), person("кузен1", "m"), person("кузен2", "f"),
    person("брат", "m"), person("невестка", "f"), person("племянник", "m"),
    person("свёкор", "m"), person("свекровь", "f"), person("деверь", "m"),
    person("дочь", "f"), person("сын", "m"), person("зять", "m"), person("внук", "m"),
  ];
  const unions = [
    union("u1", ["жена", "муж"], ["дочь", "сын"]),
    union("u2", ["отец", "мать"], ["жена", "брат"]),
    union("u3", ["дедМ", "бабМ"], ["мать", "дядя"]),
    union("u4", ["дядя", "жена_дяди"], ["кузен1", "кузен2"]),
    union("u5", ["брат", "невестка"], ["племянник"]),
    union("u6", ["свёкор", "свекровь"], ["муж", "деверь"]),
    union("u7", ["дочь", "зять"], ["внук"]),
  ];
  return { people, unions };
}

export function laneReport(L: ReturnType<typeof layoutFamily>) {
  const byRow = new Map<number, typeof L.buses>();
  for (const b of L.buses) { const k = b.fromY ?? 0; (byRow.get(k) ?? byRow.set(k, []).get(k)!).push(b); }
  let merged = 0, maxLanes = 0;
  const ext = (b: (typeof L.buses)[number]) => [Math.min(b.fromX ?? Infinity, ...b.xs), Math.max(b.fromX ?? -Infinity, ...b.xs)];
  for (const list of byRow.values()) {
    maxLanes = Math.max(maxLanes, new Set(list.map((b) => Math.round(b.busY))).size);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = ext(list[i]!), b = ext(list[j]!);
      if (a[0]! <= b[1]! && b[0]! <= a[1]! && Math.abs(list[i]!.busY - list[j]!.busY) < 4) merged++;
    }
  }
  return { merged, maxLanes, buses: L.buses.length };
}

/** Искусственная семья: боковые ветки (дядя, тётя, двоюродные) и два брака у деда, один из них у центральной пары-родителя. */
export function artificial() {
  const people = [
    person("жена", "f"), person("муж", "m"),
    person("отец", "m"), person("мать", "f"), person("дедО", "m"), person("бабО1", "f"), person("бабО2", "f"),
    person("дядя", "m"), person("тётя", "f"), person("жена_дяди", "f"), person("муж_тёти", "m"),
    person("двоюр1", "m"), person("двоюр2", "f"), person("двоюр3", "m"), person("жена_двоюр1", "f"), person("внучатый", "m"),
    person("сводная", "f"), person("муж_сводной", "m"), person("сводн_дочь", "f"),
    person("свёкор", "m"), person("свекровь", "f"), person("деверь", "m"), person("жена_деверя", "f"), person("племянник_м", "m"),
    person("дочь", "f"), person("сын", "m"), person("зять", "m"), person("невестка", "f"), person("внук1", "m"), person("внук2", "f"),
  ];
  const unions = [
    union("u_пара", ["жена", "муж"], ["дочь", "сын"]),
    union("u_род_ж", ["отец", "мать"], ["жена"]),
    union("u_дед1", ["дедО", "бабО1"], ["отец", "дядя", "тётя"]),
    union("u_дед2", ["дедО", "бабО2"], ["сводная"]),
    union("u_дядя", ["дядя", "жена_дяди"], ["двоюр1", "двоюр2", "двоюр3"]),
    union("u_тётя", ["тётя", "муж_тёти"], []),
    union("u_двоюр1", ["двоюр1", "жена_двоюр1"], ["внучатый"]),
    union("u_сводная", ["сводная", "муж_сводной"], ["сводн_дочь"]),
    union("u_род_м", ["свёкор", "свекровь"], ["муж", "деверь"]),
    union("u_деверь", ["деверь", "жена_деверя"], ["племянник_м"]),
    union("u_дочь", ["дочь", "зять"], ["внук1"]),
    union("u_сын", ["сын", "невестка"], ["внук2"]),
  ];
  return { people, unions };
}

/** Пример Елизаветы: два родных брата женаты на двух двоюродных сёстрах; матери сестёр родные сёстры, общие прародители. */
export function elizaveta() {
  const people = [
    person("брат1", "m"), person("брат2", "m"), person("отецБ", "m"), person("матьБ", "f"),
    person("сестра1", "f"), person("сестра2", "f"), person("мама1", "f"), person("мама2", "f"), person("папа1", "m"), person("папа2", "m"),
    person("прадед", "m"), person("прабаба", "f"),
    person("сын1", "m"), person("дочь2", "f"),
  ];
  const unions = [
    union("род_братьев", ["отецБ", "матьБ"], ["брат1", "брат2"]),
    union("прародители", ["прадед", "прабаба"], ["мама1", "мама2"]),
    union("род_с1", ["папа1", "мама1"], ["сестра1"]),
    union("род_с2", ["папа2", "мама2"], ["сестра2"]),
    union("брак1", ["брат1", "сестра1"], ["сын1"]),
    union("брак2", ["брат2", "сестра2"], ["дочь2"]),
  ];
  return { people, unions };
}

/** Вариант посложнее: мать братьев тоже дочь тех же прародителей (братья и сёстры ещё и двоюродные между собой). */
export function elizavetaTangled() {
  const { people, unions } = elizaveta();
  const u = unions.map((x) => (x.id === "прародители" ? { ...x, childIds: [...x.childIds, "матьБ"] } : x));
  return { people, unions: u };
}

/** Чья сторона: поиск в ширину от «меня» и «мужа» одновременно, связь между ними не считается. */
export function sides(data: ReturnType<typeof treeFromPeople>, me: string, husband: string): Map<string, "W" | "H"> {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  for (const u of data.unions) {
    if (u.partnerIds.length === 2 && u.partnerIds.includes(me) && u.partnerIds.includes(husband)) { for (const c of u.childIds) { link(me, c); link(husband, c); } continue; }
    if (u.partnerIds.length === 2) link(u.partnerIds[0]!, u.partnerIds[1]!);
    for (const p of u.partnerIds) for (const c of u.childIds) link(p, c);
  }
  const out = new Map<string, "W" | "H">([[me, "W"], [husband, "H"]]);
  const q = [me, husband];
  for (let i = 0; i < q.length; i++) for (const n of adj.get(q[i]!) ?? []) if (!out.has(n)) { out.set(n, out.get(q[i]!)!); q.push(n); }
  return out;
}

export function wingStats(layout: ReturnType<typeof layoutTree>, side: Map<string, "W" | "H">) {
  const rows = new Map<number, { x: number; s: "W" | "H" }[]>();
  for (const n of layout.nodes) {
    const s = side.get(n.id);
    if (!s) continue;
    (rows.get(Math.round(n.y)) ?? rows.set(Math.round(n.y), []).get(Math.round(n.y))!).push({ x: n.x, s });
  }
  let switches = 0, total = 0;
  for (const list of rows.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) if (list[i]!.s !== list[i - 1]!.s) switches++;
    total += list.length;
  }
  return { rows: rows.size, switches, total, width: layout.width };
}
