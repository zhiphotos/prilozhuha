import type { Person, Union } from "./types.ts";

/** Первый год из записи («1950», «12.03.1950», «около 1950»); если года нет, бесконечность. */
function yearOf(text: string | undefined): number {
  const m = /(\d{4})/.exec(text ?? "");
  return m ? Number(m[1]) : Number.POSITIVE_INFINITY;
}

/**
 * Какие линии детей рисовать пунктиром (сводные братья и сёстры).
 * Если у человека несколько союзов с детьми, сплошным остаётся ОДИН главный союз, остальные пунктиром.
 * Главный выбирается только по самим данным, а не по порядку внесения людей:
 * 1) союз, где известны оба родителя, важнее союза с одним известным родителем;
 * 2) затем раньше начатый союз (год начала брака);
 * 3) затем союз с самым старшим ребёнком (год рождения);
 * 4) если и этого нет, по идентификаторам партнёров (одинаково при любом порядке и после перезагрузки).
 * Типов связи «приёмный» и «неродной» в модели данных нет (тип у связи всегда «родной»), поэтому они здесь не учитываются.
 */
export function halfUnionIds(unions: Pick<Union, "id" | "partnerIds" | "childIds" | "startYear">[], people: Pick<Person, "id" | "birthYear">[] = []): Set<string> {
  const born = new Map(people.map((p) => [p.id, yearOf(p.birthYear)]));
  const withKids = unions.filter((u) => u.childIds.length);
  const rank = (u: (typeof withKids)[number]): [number, number, number, string] => [
    u.partnerIds.length >= 2 ? 0 : 1,
    yearOf(u.startYear),
    Math.min(...u.childIds.map((id) => born.get(id) ?? Number.POSITIVE_INFINITY)),
    [...u.partnerIds].sort().join("|"),
  ];
  const before = (a: (typeof withKids)[number], b: (typeof withKids)[number]): number => {
    const x = rank(a);
    const y = rank(b);
    for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return (x[i] as number) < (y[i] as number) ? -1 : 1;
    return x[3] < y[3] ? -1 : x[3] > y[3] ? 1 : 0;
  };
  const byPerson = new Map<string, typeof withKids>();
  for (const u of withKids) for (const id of u.partnerIds) byPerson.set(id, [...(byPerson.get(id) ?? []), u]);
  const out = new Set<string>();
  for (const list of byPerson.values()) {
    if (list.length < 2) continue;
    const main = [...list].sort(before)[0]!;
    for (const u of list) if (u !== main) out.add(u.id);
  }
  return out;
}
