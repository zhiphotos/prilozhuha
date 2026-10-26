import type { ImportedPerson } from "./gedImport.ts";

/** Разбор таблицы (CSV из Excel или Google Таблиц) в людей. Колонки находим по названию, порядок любой. */
const HEAD: Record<string, RegExp> = {
  last: /^фамили/i,
  first: /^имя$|^имя\b/i,
  patronymic: /^отчеств/i,
  birth: /рожд|год\s*рожд|^год$/i,
  death: /смерт|ухода/i,
  gender: /^пол$/i,
  relation: /кем\s*приход|родств|роль/i,
  father: /^отец|отца/i,
  mother: /^мать|матери|^мама/i,
  spouse: /супруг|муж|жена/i,
};

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const year = (v: string) => (v.match(/\d{4}/)?.[0] ?? "");
const full = (p: { lastName: string; firstName: string; patronymic: string }) => [p.lastName, p.firstName, p.patronymic].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ");
const genderOf = (v: string, relation: string): "m" | "f" | undefined => {
  const t = `${v} ${relation}`.toLowerCase();
  if (/^(ж|f)|жен|мама|мать|бабуш|сестр|дочь|тёт|тет/.test(v.toLowerCase()) || /(мама|мать|бабуш|сестр|дочь|тёт|тет|жена)/.test(t)) return "f";
  if (/^(м|m)|муж|папа|отец|дед|брат|сын|дяд/.test(v.toLowerCase()) || /(папа|отец|дед|брат|сын|дяд|муж)/.test(t)) return "m";
  return undefined;
};

export function parseTable(text: string): { people: ImportedPerson[] } | { error: string } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "В таблице нет строк с людьми." };
  const sep = [";", "\t", ","].map((s) => [s, (lines[0]!.match(new RegExp(s === "\t" ? "\t" : `\\${s}`, "g")) ?? []).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const head = splitLine(lines[0]!, sep);
  const col: Partial<Record<keyof typeof HEAD, number>> = {};
  head.forEach((h, i) => {
    for (const [key, re] of Object.entries(HEAD)) if (col[key as keyof typeof HEAD] === undefined && re.test(h.trim())) col[key as keyof typeof HEAD] = i;
  });
  if (col.first === undefined && col.last === undefined) return { error: "Не нашла колонки «Фамилия» и «Имя». Назовите их так в первой строке." };
  const rows = lines.slice(1).map((l) => splitLine(l, sep));
  const get = (r: string[], k: keyof typeof HEAD) => (col[k] === undefined ? "" : (r[col[k]!] ?? ""));
  const people = rows
    .map((r, i) => ({
      key: `t${i + 1}`,
      firstName: get(r, "first"),
      patronymic: get(r, "patronymic"),
      lastName: get(r, "last"),
      relation: get(r, "relation") || "родственник",
      birthYear: year(get(r, "birth")),
      deathYear: year(get(r, "death")) || undefined,
      gender: genderOf(get(r, "gender"), get(r, "relation")),
      notes: "",
      parentKeys: [] as string[],
      spouseKey: undefined as string | undefined,
      _father: get(r, "father"),
      _mother: get(r, "mother"),
      _spouse: get(r, "spouse"),
    }))
    .filter((p) => p.firstName || p.lastName);
  const byName = new Map(people.map((p) => [full(p), p.key]));
  const find = (name: string) => (name ? byName.get(name.toLowerCase().replace(/\s+/g, " ").trim()) : undefined);
  return {
    people: people.map(({ _father, _mother, _spouse, ...p }) => ({
      ...p,
      parentKeys: [find(_father), find(_mother)].filter((x): x is string => Boolean(x)),
      spouseKey: find(_spouse),
    })),
  };
}
