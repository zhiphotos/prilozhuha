import type { Person as RodPerson } from "@/lib/rod/types";
import type { ImportedPerson } from "./gedImport.ts";
import { roleOf } from "./from-people.ts";
import { yearNum } from "./kinship.ts";
import { normalizeSurnames } from "./surnames.ts";
import type { TreeData } from "./types.ts";

/** Имя и фамилия для сравнения: без регистра, «ё» как «е». */
export function sameKey(first: string, last: string): string {
  const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, "е");
  const f = norm(first).split(/\s+/)[0] ?? "";
  const l = norm(last);
  return f && l ? `${f}|${l}` : "";
}

/** Годы рождения не спорят: равны или хотя бы у одного не указан. */
export function yearsAgree(a?: string, b?: string): boolean {
  const ya = yearNum(a);
  const yb = yearNum(b);
  return ya === 9999 || yb === 9999 || ya === yb;
}

/** Из двух дат одного человека берём более полную: «23.05.2002» лучше, чем «2002». Если годы спорят, остаётся прежняя. */
export function fuller(old: string | undefined, next: string | undefined): string | undefined {
  if (!next) return old;
  if (!old) return next;
  return yearsAgree(old, next) && next.length > old.length ? next : old;
}

/** Запись без настоящего имени: «Мама», «Папа», «Бабушка» и т. п. */
export function isPlaceholder(c: RodPerson): boolean {
  const first = (c.firstName ?? c.name).trim().toLowerCase();
  return /^(мама|папа|мать|отец|бабушка|дедушка|я)$/.test(first) || !c.lastName?.trim() && !/\s/.test(c.name.trim()) && first === c.relation.trim().toLowerCase();
}

/** Кто из уже записанных людей – тот же человек, что в файле. Запись «я» совпадает с выбранным «Я», мама и папа – по роли, остальные – по имени и фамилии (годы не спорят). */
export function matchExisting(current: RodPerson[], list: ImportedPerson[]): Map<string, RodPerson> {
  const taken = new Set<string>();
  const matched = new Map<string, RodPerson>();
  const lastOf = (c: RodPerson) => normalizeSurnames(c.lastName ?? c.name.split(/\s+/).slice(-1)[0] ?? "").lastName;
  /** Тот же человек из того же файла: совпадают источник и id, а имя не спорит (в разных семьях id вроде I51 повторяются, поэтому одного id мало). */
  const byGedId = (p: ImportedPerson): RodPerson | undefined =>
    p.source
      ? current.find((c) => {
          if (taken.has(c.id) || c.gedId !== p.key || c.gedSource !== p.source) return false;
          const firstsAgree = !p.firstName.trim() || !(c.firstName ?? c.name).trim() || sameFirst(c, p);
          const a = lastOf(c).trim().toLowerCase().replace(/ё/g, "е");
          const b = normalizeSurnames(p.lastName).lastName.trim().toLowerCase().replace(/ё/g, "е");
          const fileMaiden = (p.maidenName ?? "").trim().toLowerCase().replace(/ё/g, "е");
          // Фамилия могла смениться при замужестве: тогда прежняя фамилия записана у одной из сторон как девичья.
          return firstsAgree && (!a || !b || a === b || (c.maidenName ?? "").trim().toLowerCase().replace(/ё/g, "е") === b || (fileMaiden !== "" && fileMaiden === a));
        })
      : undefined;
  const find = (p: ImportedPerson): RodPerson | undefined => {
    const exact = byGedId(p);
    if (exact) return exact;
    const mine = p.relation === "я";
    const want = sameKey(p.firstName, p.lastName);
    const byName = current.find((c) => {
      if (taken.has(c.id)) return false;
      // «Я» совпадает с записанным «я» только если это тот же человек (имя не спорит) или запись пустая: чужого человека из тестовых данных не перезаписываем.
      if (mine && /^(я|сам|сама)$/i.test(c.relation.trim())) return isPlaceholder(c) || sameFirst(c, p);
      if (!want) return false;
      // Фамилию записанного человека приводим так же, как при чтении файла: иначе «Межова (Дорохина)» из старой загрузки не совпала бы с «Межова» и человек задвоился бы при повторной загрузке.
      if (sameKey(c.firstName ?? c.name.split(/\s+/)[0] ?? "", normalizeSurnames(c.lastName ?? c.name.split(/\s+/).slice(-1)[0] ?? "").lastName) !== want) return false;
      return yearsAgree(c.birthYear, p.birthYear);
    });
    if (byName) return byName;
    const role = roleOf(p.relation);
    if (role === "mother" || role === "father") return current.find((c) => !taken.has(c.id) && roleOf(c.relation) === role && (isPlaceholder(c) || sameFirst(c, p)));
    return undefined;
  };
  for (const p of list) {
    const found = find(p);
    if (!found) continue;
    taken.add(found.id);
    matched.set(p.key, found);
  }
  return matched;
}

/** Человек из файла, который, скорее всего, и есть тот, кто уже записан как «я»: по имени (и фамилии, если она есть). */
export function guessSelf(tree: TreeData, current: RodPerson[]): string {
  const me = current.find((c) => /^(я|сам|сама)$/i.test(c.relation.trim()));
  if (!me) return tree.focusId;
  const first = (me.firstName ?? me.name.split(/\s+/)[0] ?? "").trim().toLowerCase().replace(/ё/g, "е");
  const last = (me.lastName ?? me.name.split(/\s+/).slice(1).join(" ")).trim().toLowerCase().replace(/ё/g, "е");
  const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, "е");
  const hits = tree.people.filter((p) => norm(p.firstName).split(/\s+/)[0] === first && (!last || norm(p.lastName) === last) && yearsAgree(me.birthYear, p.birthYear));
  // Если однозначно угадать нельзя (в файле несколько тёзок), пусть человек выберет себя сам: чужой «Я» ломает все подписи.
  return hits.length === 1 ? hits[0]!.id : "";
}

export function sameFirst(c: RodPerson, p: ImportedPerson): boolean {
  const n = (x: string) => x.trim().toLowerCase().replace(/ё/g, "е").split(/\s+/)[0] ?? "";
  return n(c.firstName ?? c.name) === n(p.firstName);
}

/** Что файл хотел бы изменить у уже записанных людей: связи, которые отличаются от записанных. Эти связи без подтверждения не трогаем. */
export function linkDiffs(current: RodPerson[], list: ImportedPerson[], matched: Map<string, RodPerson>): { id: string; name: string; what: string }[] {
  const out: { id: string; name: string; what: string }[] = [];
  const resolve = (key: string) => matched.get(key)?.id ?? `new:${key}`;
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
  for (const p of list) {
    const found = matched.get(p.key);
    if (!found) continue;
    const fileParents = p.parentKeys.map(resolve);
    if ((found.parents ?? []).length && fileParents.length && !same(found.parents ?? [], fileParents)) out.push({ id: found.id, name: found.name, what: "родители" });
    if (found.spouse && p.spouseKey && found.spouse !== resolve(p.spouseKey)) out.push({ id: found.id, name: found.name, what: "супруг" });
  }
  void current;
  return out;
}

function composeName(parts: { firstName?: string; patronymic?: string; lastName?: string }): string {
  return [parts.firstName, parts.patronymic, parts.lastName].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
}

export function linksOf(p: ImportedPerson, keyToId: Map<string, string>): Partial<RodPerson> {
  const parents = p.parentKeys.map((k) => keyToId.get(k)).filter((x): x is string => Boolean(x));
  const spouse = p.spouseKey ? keyToId.get(p.spouseKey) : undefined;
  const more = (p.moreSpouses ?? [])
    .map((m) => ({ id: keyToId.get(m.key), status: m.status, from: m.from, to: m.to }))
    .filter((m): m is { id: string; status: "married" | "divorced" | "partners" | undefined; from: string | undefined; to: string | undefined } => Boolean(m.id));
  return { parents: parents.length ? parents : undefined, spouse, spouseStatus: p.spouseStatus, unionFrom: p.unionFrom, unionTo: p.unionTo, moreSpouses: more.length ? more : undefined };
}

export function toRod(p: ImportedPerson, id: string, keyToId: Map<string, string>): RodPerson {
  return {
    id,
    name: composeName(p),
    firstName: p.firstName,
    patronymic: p.patronymic,
    lastName: p.lastName,
    relation: p.relation,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    maidenName: p.maidenName ?? "",
    notes: p.notes,
    gender: p.gender,
    fromFile: true,
    gedId: p.key,
    gedSource: p.source,
    ...linksOf(p, keyToId),
  } as RodPerson;
}

/**
 * Применение загрузки файла к списку «Люди»: чистая функция, ничего не пишет сама.
 * Новые люди добавляются, найденные не дублируются. Связи и «Кем приходится» у найденных людей берутся из файла только там, где у человека их ещё нет
 * (если не включено «заменить»). Разных людей с одинаковым именем не объединяет: см. matchExisting.
 */
export function planGedImport(
  current: RodPerson[],
  list: ImportedPerson[],
  options: { updateLinks: boolean; uid: () => string },
): { ok: true; people: RodPerson[]; added: number; updated: number; keyToId: Map<string, string> } | { ok: false; reason: string } {
  const { updateLinks, uid } = options;
  const created: RodPerson[] = [];
  const matched = matchExisting(current, list);
  const selfIn = list.find((p) => p.relation === "я");
  const mineNow = current.find((c) => /^(я|сам|сама)$/i.test(c.relation.trim()));
  if (selfIn && mineNow && matched.get(selfIn.key)?.id !== mineNow.id) {
    return { ok: false, reason: `В списке уже есть «я»: ${mineNow.name}, а в файле «я» – ${composeName(selfIn)}. Это разные люди, поэтому ничего не добавлено. Если запись «${mineNow.name}» тестовая, удалите её или выберите её же в файле.` };
  }
  const keyToId = new Map<string, string>();
  for (const p of list) keyToId.set(p.key, matched.get(p.key)?.id ?? uid());
  for (const p of list) if (!matched.has(p.key)) created.push(toRod(p, keyToId.get(p.key)!, keyToId));
  const updated = new Map<string, RodPerson>();
  for (const p of list) {
    const found = matched.get(p.key);
    if (!found) continue;
    const links = linksOf(p, keyToId);
    const keepParents = (found.parents ?? []).length > 0 && !updateLinks;
    const keepSpouse = Boolean(found.spouse) && !updateLinks;
    const parents = keepParents ? found.parents : links.parents ?? found.parents;
    const spouse = keepSpouse ? found.spouse : links.spouse ?? found.spouse;
    const emptyRelation = !found.relation.trim() || /^(не указано|—|-)$/i.test(found.relation.trim());
    updated.set(found.id, {
      ...found,
      relation: updateLinks || emptyRelation || isPlaceholder(found) ? p.relation : found.relation,
      fromFile: found.fromFile || Boolean((parents ?? []).length) || Boolean(spouse) || undefined,
      gedId: found.gedId ?? p.key,
      gedSource: found.gedSource ?? p.source,
      ...(isPlaceholder(found) || (!found.lastName?.trim() && sameFirst(found, p)) ? { name: composeName(p), firstName: p.firstName, patronymic: p.patronymic, lastName: p.lastName } : {}),
      parents,
      spouse,
      spouseStatus: keepSpouse ? found.spouseStatus : links.spouseStatus ?? found.spouseStatus,
      moreSpouses: keepSpouse ? found.moreSpouses : links.moreSpouses ?? found.moreSpouses,
      gender: found.gender ?? p.gender,
      birthYear: fuller(found.birthYear, p.birthYear) ?? "",
      deathYear: fuller(found.deathYear, p.deathYear),
      // Девичья фамилия из файла дописывается тем, у кого её ещё нет (первая загрузка шла, когда приложение её не читало); своя запись человека главнее.
      maidenName: found.maidenName?.trim() ? found.maidenName : p.maidenName?.trim() ? p.maidenName : found.maidenName,
    });
  }
  const fix = created.map((c) => {
    const src = list.find((p) => keyToId.get(p.key) === c.id)!;
    return { ...c, ...linksOf(src, keyToId) };
  });
  return { ok: true, people: [...fix, ...current.map((c) => updated.get(c.id) ?? c)], added: fix.length, updated: updated.size, keyToId };
}

/** Люди из файла, у которых совпали источник и id с уже записанным человеком, но имя или фамилия изменились настолько, что уверенности нет: они добавятся как новые, поэтому показываем их в просмотре, чтобы дубль можно было заметить. */
export function possibleSame(current: RodPerson[], list: ImportedPerson[], matched: Map<string, RodPerson>): { id: string; name: string; fileName: string }[] {
  const taken = new Set([...matched.values()].map((c) => c.id));
  const out: { id: string; name: string; fileName: string }[] = [];
  for (const p of list) {
    if (matched.has(p.key) || !p.source) continue;
    const c = current.find((x) => !taken.has(x.id) && x.gedId === p.key && x.gedSource === p.source);
    if (c) out.push({ id: c.id, name: c.name, fileName: composeName(p) });
  }
  return out;
}
