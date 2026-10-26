import type { Person, TreeData, Union, UnionStatus } from "./types.ts";

/**
 * Загрузка из «Древа Жизни» (Agelong Tree, genery.com): файл XML, который программа сохраняет через «Экспорт».
 * Читаем людей (имя, отчество, фамилия, даты) и связи «Отец, Мать, Муж, Жена».
 */
export function isAgelongXml(text: string): boolean {
  return /<agelongtree[\s>]/i.test(text.slice(0, 2000));
}

const attr = (tag: string, name: string): string => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? decodeXml(m[1]!) : "";
};

function decodeXml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

const clean = (s: string) => (/^[?…\s]*$/.test(s) ? "" : s.replace(/\s+/g, " ").trim());
const year = (s: string) => s.match(/\d{4}/)?.[0] ?? "";

export function parseAgelongXml(text: string): { tree: TreeData } | { error: string } {
  if (!isAgelongXml(text)) return { error: "Это не файл «Древа Жизни»." };
  const start = text.indexOf("<persons>");
  const end = text.indexOf("</persons>", start);
  if (start < 0 || end < 0) return { error: "В файле нет раздела людей." };
  const block = text.slice(start, end);
  // Режем только по людям верхнего уровня (у них есть пол), вложенные «ближайшие» остаются внутри своего блока.
  const starts = [...block.matchAll(/<person id="\d+" sex="/g)].map((m) => m.index ?? 0);
  const parts = starts.map((at, i) => block.slice(at, starts[i + 1] ?? block.length));
  const people: Person[] = [];
  const links: { id: string; rel: string; to: string }[] = [];
  for (const part of parts) {
    const head = part.slice(0, part.indexOf(">") + 1);
    // Верхнего уровня только те, у кого есть пол: вложенные «ближайшие» имеют rel.
    if (!/\ssex="/.test(head)) continue;
    const id = attr(head, "id");
    const sex = attr(head, "sex");
    const full = attr(head, "fullname");
    const first = clean(attr(head, "fn"));
    const patronymic = clean(attr(head, "mn"));
    const last = clean(attr(head, "sn")) || clean(attr(head, "msn"));
    people.push({
      id: `x${id}`,
      firstName: first || clean(full.split(/\s+/).filter((w) => !w.startsWith("(")).slice(1, 2).join(" ")) || "Без имени",
      patronymic,
      lastName: last || clean(full.split(/\s+/)[0] ?? ""),
      gender: sex === "М" ? "m" : sex === "Ж" ? "f" : "u",
      birthYear: year(attr(head, "bdate")),
      deathYear: year(attr(head, "ddate")),
      photo: "",
      note: "",
    });
    const nearest = part.match(/<nearest>([\s\S]*?)<\/nearest>/)?.[1] ?? "";
    for (const m of nearest.matchAll(/<person id="(\d+)" rel="([^"]*)"/g)) links.push({ id: `x${id}`, rel: m[2]!, to: `x${m[1]}` });
  }
  if (!people.length) return { error: "В файле не нашлось людей." };
  const known = new Set(people.map((p) => p.id));
  const parents = new Map<string, { f?: string; m?: string }>();
  const couples = new Map<string, UnionStatus>();
  for (const l of links) {
    if (!known.has(l.to)) continue;
    if (l.rel === "Отец") parents.set(l.id, { ...parents.get(l.id), f: l.to });
    else if (l.rel === "Мать") parents.set(l.id, { ...parents.get(l.id), m: l.to });
    else if (/^(Муж|Жена|Мать детей|Отец детей|Отец ребёнка|Мать ребёнка|Бывш)/.test(l.rel)) {
      const key = [l.id, l.to].sort().join("|");
      const status: UnionStatus = /^Бывш/.test(l.rel) ? "divorced" : /детей|ребёнка/.test(l.rel) ? "partner" : "married";
      if (!couples.has(key) || status === "married") couples.set(key, status);
    }
  }
  const unions: Union[] = [];
  const byKey = new Map<string, Union>();
  const union = (partnerIds: string[], status: UnionStatus = "married"): Union => {
    const key = [...partnerIds].sort().join("|");
    let u = byKey.get(key);
    if (!u) {
      u = { id: `u${unions.length + 1}`, partnerIds: [...partnerIds], childIds: [], status, startYear: "", endYear: "" };
      byKey.set(key, u);
      unions.push(u);
    }
    return u;
  };
  for (const [key, status] of couples) union(key.split("|"), status);
  for (const [child, p] of parents) {
    const ps = [p.f, p.m].filter((x): x is string => Boolean(x));
    if (ps.length) union(ps).childIds.push(child);
  }
  // Фокус: человек с самой большой роднёй в файле.
  const score = new Map<string, number>();
  for (const l of links) score.set(l.id, (score.get(l.id) ?? 0) + 1);
  const focusId = [...score.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? people[0]!.id;
  return { tree: { people, unions, focusId } };
}
