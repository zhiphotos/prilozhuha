import type { Person, TreeData } from "./types.ts";

const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** «23.05.2002», «05.2002», «1990» в GEDCOM-вид («23 MAY 2002», «MAY 2002», «1990»). Что не разобрали, уходит как есть. */
export function gedDate(raw: string): string {
  const t = raw.trim();
  let m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m && +m[2]! >= 1 && +m[2]! <= 12) return `${+m[1]!} ${MON[+m[2]! - 1]} ${m[3]}`;
  m = t.match(/^(\d{1,2})\.(\d{4})$/);
  if (m && +m[1]! >= 1 && +m[1]! <= 12) return `${MON[+m[1]! - 1]} ${m[2]}`;
  return t;
}

/** Строка GEDCOM не должна содержать переводов строк. Длинные тексты уходят через CONT. */
function lines(level: number, tag: string, value: string): string[] {
  const parts = value.replace(/\r/g, "").split("\n");
  const out = [`${level} ${tag} ${parts[0] ?? ""}`.trimEnd()];
  for (const rest of parts.slice(1)) out.push(`${level + 1} CONT ${rest}`.trimEnd());
  return out;
}

const slashSafe = (s: string) => s.replace(/\//g, "-").replace(/\s+/g, " ").trim();
const isPlaceholder = (p: Person) => p.id.startsWith("__") && p.id !== "__self" && !p.birthYear && !p.deathYear && !p.note;

/**
 * Дерево книги в файл GEDCOM 5.5.1 (UTF-8): его открывают MyHeritage, Ancestry, Gramps, Family Tree Maker и другие программы.
 * Пустые заготовки «Мама»/«Папа», которые приложение рисует само, в файл не попадают.
 */
export function gedcomFromTree(tree: TreeData, now = new Date()): string {
  const people = tree.people.filter((p) => !isPlaceholder(p));
  const ids = new Map(people.map((p, i) => [p.id, `I${i + 1}`]));
  const unions = tree.unions
    .map((u) => ({ ...u, partnerIds: u.partnerIds.filter((id) => ids.has(id)), childIds: u.childIds.filter((id) => ids.has(id)) }))
    .filter((u) => u.partnerIds.length > 0 || u.childIds.length > 0);
  const famIds = new Map(unions.map((u, i) => [u.id, `F${i + 1}`]));
  const out: string[] = [
    "0 HEAD",
    "1 SOUR KnigaRoda",
    "2 NAME Книга рода",
    "2 CORP kniga-balanuca.ru",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8",
    `1 DATE ${now.getUTCDate()} ${MON[now.getUTCMonth()]} ${now.getUTCFullYear()}`,
  ];
  for (const p of people) {
    out.push(`0 @${ids.get(p.id)}@ INDI`);
    const given = [p.firstName, p.patronymic].map((x) => slashSafe(x)).filter(Boolean).join(" ");
    const last = slashSafe(p.lastName);
    out.push(`1 NAME ${given} /${last}/`.replace(/\s+/g, " "));
    if (p.firstName.trim()) out.push(`2 GIVN ${slashSafe(given)}`);
    const maiden = slashSafe(p.maidenName ?? "");
    const hasMaiden = Boolean(maiden) && maiden.toLowerCase() !== last.toLowerCase();
    // Как у Familio: в имени фамилия в замужестве, девичья лежит в SURN, фамилия в замужестве дублируется в _MARNM.
    if (hasMaiden) out.push(`2 SURN ${maiden}`, `2 _MARNM ${last}`);
    else if (last) out.push(`2 SURN ${last}`);
    // Для программ, которые читают девичью фамилию отдельным именем.
    if (hasMaiden) out.push(`1 NAME ${given} /${maiden}/`.replace(/\s+/g, " "), "2 TYPE birth");
    if (p.gender === "m" || p.gender === "f") out.push(`1 SEX ${p.gender === "m" ? "M" : "F"}`);
    if (p.birthYear || p.birthPlace) {
      out.push("1 BIRT");
      if (p.birthYear) out.push(`2 DATE ${gedDate(p.birthYear)}`);
      if (p.birthPlace) out.push(`2 PLAC ${slashSafe(p.birthPlace)}`);
    }
    if (p.deathYear) out.push("1 DEAT", `2 DATE ${gedDate(p.deathYear)}`);
    if (p.note.trim()) out.push(...lines(1, "NOTE", p.note.trim()));
    for (const u of unions) {
      const fam = famIds.get(u.id)!;
      if (u.partnerIds.includes(p.id)) out.push(`1 FAMS @${fam}@`);
      if (u.childIds.includes(p.id)) out.push(`1 FAMC @${fam}@`);
    }
  }
  const byId = new Map(people.map((p) => [p.id, p]));
  for (const u of unions) {
    out.push(`0 @${famIds.get(u.id)}@ FAM`);
    const husb = u.partnerIds.find((id) => byId.get(id)?.gender === "m");
    const wife = u.partnerIds.find((id) => byId.get(id)?.gender === "f" && id !== husb);
    const rest = u.partnerIds.filter((id) => id !== husb && id !== wife);
    // Если пол неизвестен, первый партнёр идёт как HUSB, второй как WIFE: так принято для файла, пол человека при этом не меняется.
    const h = husb ?? rest.shift();
    const w = wife ?? rest.shift();
    if (h) out.push(`1 HUSB @${ids.get(h)}@`);
    if (w) out.push(`1 WIFE @${ids.get(w)}@`);
    for (const c of u.childIds) out.push(`1 CHIL @${ids.get(c)}@`);
    if (u.startYear) out.push("1 MARR", `2 DATE ${gedDate(u.startYear)}`);
    else if (u.status === "married") out.push("1 MARR");
    if (u.status === "divorced" || u.endYear) {
      out.push("1 DIV");
      if (u.endYear) out.push(`2 DATE ${gedDate(u.endYear)}`);
    }
  }
  out.push("0 TRLR");
  return out.join("\r\n") + "\r\n";
}
