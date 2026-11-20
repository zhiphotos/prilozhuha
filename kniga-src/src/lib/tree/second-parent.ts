// Этап 3а «отношения»: правила добавления ребёнка со вторым родителем (только данные, экрана нет).
// Форма (этап 3б) вызывает эти функции. Здесь нет ни одной записи брака или союза: ребёнок получает только биологических родителей.
import type { Person as RodPerson } from "../rod/types.ts";

export type SecondParentChoice =
  | { mode: "partner"; id: string } // подтверждён предложенный партнёр (в паре есть запись супруга или союза)
  | { mode: "coparent"; id: string } // человек, с которым у первого родителя уже есть общий ребёнок без записи брака
  | { mode: "existing"; id: string } // другой человек из древа
  | { mode: "new"; person: Omit<RodPerson, "id"> } // новый человек
  | { mode: "unknown" };

export type SecondParentOption = { kind: "partner" | "coparent"; id: string; status?: "married" | "divorced" | "widowed" | "partners"; current: boolean };

export type Confirmations = {
  /** Пользователь прочитал мягкие предупреждения и подтвердил, что данные верны. */
  warnings?: boolean;
  /** Пользователь согласен заменить уже записанных родителей существующего человека. */
  replaceParents?: boolean;
  /** Пользователь подтвердил, что новый человек не совпадает с похожим. */
  notDuplicate?: boolean;
  /**
   * Защита от устаревшего подтверждения: родители существующего ребёнка, которые пользователь видел на экране.
   * Не совпали с тем, что записано сейчас: ничего не пишется, возвращается needs.stale. Без поля проверки нет (как в 3а).
   */
  expectedParents?: string[];
  /** То же для отметки parentsUnmarried, которую пользователь видел на экране. */
  expectedUnmarried?: boolean;
};

const ghost = (id: string) => id.startsWith("__");
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
const yearOf = (raw?: string) => {
  const m = /(?<!\d)(\d{4})(?!\d)/.exec(raw ?? "");
  return m ? Number(m[1]) : null;
};

/** Записанные партнёры (по полям супруга) и их статус. Общий ребёнок сам по себе брак не доказывает. */
export function partnersOf(people: RodPerson[], id: string): { id: string; status: "married" | "divorced" | "widowed" | "partners" }[] {
  const real = new Set(people.map((p) => p.id));
  const out = new Map<string, "married" | "divorced" | "widowed" | "partners">();
  const st = (s?: string) => (s === "divorced" ? "divorced" : s === "widowed" ? "widowed" : s === "partners" ? "partners" : "married");
  const me = people.find((p) => p.id === id);
  if (me?.spouse && real.has(me.spouse)) out.set(me.spouse, st(me.spouseStatus));
  for (const m of me?.moreSpouses ?? []) if (real.has(m.id)) out.set(m.id, st(m.status));
  for (const p of people) {
    if (p.spouse === id && !out.has(p.id)) out.set(p.id, st(p.spouseStatus));
    for (const m of p.moreSpouses ?? []) if (m.id === id && !out.has(p.id)) out.set(p.id, st(m.status));
  }
  return [...out].map(([pid, status]) => ({ id: pid, status }));
}

/** Предложения для блока «Второй родитель»: записанные партнёры (текущие первыми) и те, с кем уже есть общий ребёнок. Ничего не выбирается само. */
export function secondParentOptions(people: RodPerson[], firstId: string): SecondParentOption[] {
  const partners = partnersOf(people, firstId);
  const out: SecondParentOption[] = partners.map((p) => ({ kind: "partner", id: p.id, status: p.status, current: p.status !== "divorced" }));
  const known = new Set(partners.map((p) => p.id));
  for (const p of people) {
    if (!(p.parents ?? []).includes(firstId)) continue;
    for (const other of p.parents ?? []) if (other !== firstId && !ghost(other) && !known.has(other) && people.some((q) => q.id === other)) {
      known.add(other);
      out.push({ kind: "coparent", id: other, current: false });
    }
  }
  return out.sort((a, b) => Number(b.current) - Number(a.current));
}

/** Все потомки человека по спискам родителей. */
export function descendantsOf(people: RodPerson[], id: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const p of people) for (const par of p.parents ?? []) kids.set(par, [...(kids.get(par) ?? []), p.id]);
  const seen = new Set<string>();
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(kids.get(cur) ?? []));
  }
  return seen;
}

const ancestorsOf = (people: RodPerson[], id: string): Set<string> => {
  const byId = new Map(people.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const stack = [...(byId.get(id)?.parents ?? [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(byId.get(cur)?.parents ?? []));
  }
  return seen;
};

/** Похожие на нового человека: то же имя и фамилия (без учёта регистра, ё и е); годы рождения не должны отличаться. */
export function similarPeople(people: RodPerson[], draft: Pick<RodPerson, "firstName" | "lastName" | "birthYear">): RodPerson[] {
  const first = norm(draft.firstName ?? "");
  if (!first) return [];
  const last = norm(draft.lastName ?? "");
  const y = yearOf(draft.birthYear);
  return people.filter((p) => {
    if (norm(p.firstName ?? "") !== first) return false;
    if (norm(p.lastName ?? "") !== last && norm(p.maidenName ?? "") !== last) return false;
    const py = yearOf(p.birthYear);
    return !(y != null && py != null && y !== py);
  });
}

export type ChildSpec = { mode: "new"; person: Omit<RodPerson, "id"> } | { mode: "existing"; id: string };

export type PlanInput = {
  people: RodPerson[];
  firstId: string;
  child: ChildSpec;
  second: SecondParentChoice;
  confirm?: Confirmations;
  newId: () => string;
};

export type Needs = {
  warnings?: string[];
  replaceParents?: string[];
  similar?: string[];
  /** Родители или отметка изменились после показа экрана подтверждения: старое подтверждение недействительно. */
  stale?: boolean;
  /** Актуальное состояние ребёнка на момент отказа (для нового предварительного просмотра). */
  current?: { parents: string[]; unmarried: boolean };
};
export type PlanResult = { ok: true; people: RodPerson[]; childId: string; secondId?: string } | { ok: false; errors: string[]; needs?: Needs };

/** Родители без служебных заглушек, без повторов (порядок сохраняется). */
export function realParents(parents?: string[]): string[] {
  return [...new Set((parents ?? []).filter((id) => !ghost(id)))];
}

/** Что записано у ребёнка сейчас: настоящие родители и отметка «общий ребёнок». Ничего не меняет. */
export function currentParentsState(people: RodPerson[], childId: string): { parents: string[]; unmarried: boolean } | null {
  const kid = people.find((p) => p.id === childId);
  if (!kid) return null;
  return { parents: realParents(kid.parents), unmarried: Boolean((kid as { parentsUnmarried?: boolean }).parentsUnmarried) };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

export type ParentsDiff = { before: string[]; after: string[]; kept: string[]; removed: string[]; added: string[]; destructive: boolean; unchanged: boolean };

/**
 * Что изменится в списке родителей: кто остаётся, кто снимается, кто добавляется. Только расчёт, данные не меняет.
 * destructive: хотя бы один из нынешних родителей пропадает. Заглушки не считаются родителями.
 */
export function parentsDiff(before: string[], after: string[]): ParentsDiff {
  const b = realParents(before);
  const a = realParents(after);
  const removed = b.filter((id) => !a.includes(id));
  const added = a.filter((id) => !b.includes(id));
  return { before: b, after: a, kept: b.filter((id) => a.includes(id)), removed, added, destructive: removed.length > 0, unchanged: !removed.length && !added.length };
}

/**
 * Итог проверки облака перед правкой связей (см. checkCloudBeforeEdit в sync.ts).
 * checked: вошли, синхронизация удалась. no-cloud: эта книга НИКОГДА не синхронизировалась, облачной копии нет.
 * signed-out: книга раньше синхронизировалась, а сейчас вход не выполнен: проверка невозможна.
 * unknown: по локальным отметкам нельзя достоверно сказать, есть ли облачная копия (считается, что может быть).
 * failed, conflict, busy, timeout: вошли, но проверка не удалась.
 */
export type CloudCheck = "checked" | "no-cloud" | "signed-out" | "unknown" | "failed" | "conflict" | "busy" | "timeout";

/**
 * Можно ли выполнять операцию. Замена и снятие существующего родителя разрешены, только если облако проверено
 * или его нет совсем. Добавление без удаления связей разрешено всегда. Только расчёт, данные не меняет.
 */
export function replacePolicy(diff: ParentsDiff, cloud: CloudCheck): { allowed: boolean; reason?: "cloud-unchecked" } {
  if (!diff.destructive) return { allowed: true };
  if (cloud === "checked" || cloud === "no-cloud") return { allowed: true };
  return { allowed: false, reason: "cloud-unchecked" };
}

/**
 * Записывает ребёнка с родителями ОДНИМ результатом (список людей целиком) или отказывает, ничего не меняя.
 * Пишет только: parents ребёнка, признак parentsUnmarried (если между родителями нет записи супруга) и, при выборе «новый», самого нового человека без супруга.
 * Браки, союзы, усыновители, опекуны и дети других людей не меняются.
 */
export function planChildWithParents(input: PlanInput): PlanResult {
  const { people, firstId, child, second, confirm = {} } = input;
  const byId = new Map(people.map((p) => [p.id, p]));
  const first = byId.get(firstId);
  if (!first) return { ok: false, errors: ["Сначала заполните это место, потом добавляйте родню"] };
  const errors: string[] = [];
  const warnings: string[] = [];

  let secondId: string | undefined;
  let newSecond: Omit<RodPerson, "id"> | undefined;
  if (second.mode === "new") {
    newSecond = second.person;
    if (!(newSecond.firstName ?? "").trim()) errors.push("Напишите имя второго родителя");
  } else if (second.mode !== "unknown") {
    secondId = second.id;
    if (!byId.has(secondId)) errors.push("Этого человека нет в древе");
  }

  const childId = child.mode === "existing" ? child.id : undefined;
  if (child.mode === "existing" && !byId.has(child.id)) errors.push("Этого ребёнка нет в древе");
  if (childId) {
    if (childId === firstId) errors.push("Человек не может быть собственным ребёнком");
    if (secondId && childId === secondId) errors.push("Человек не может быть собственным родителем");
    const below = descendantsOf(people, childId);
    if (below.has(firstId)) errors.push("Так род зациклится: этот человек потомок будущего ребёнка");
    if (secondId && below.has(secondId)) errors.push("Так род зациклится: второй родитель потомок будущего ребёнка");
  }
  if (secondId && secondId === firstId) errors.push("Второй родитель не может быть первым");
  if (errors.length) return { ok: false, errors };

  // Устаревшее подтверждение: пользователь видел одних родителей и одну отметку, а записаны другие. Ничего не пишем.
  if (child.mode === "existing" && (confirm.expectedParents !== undefined || confirm.expectedUnmarried !== undefined)) {
    const now = currentParentsState(people, child.id);
    if (now) {
      const parentsChanged = confirm.expectedParents !== undefined && !sameSet(realParents(confirm.expectedParents), now.parents);
      const flagChanged = confirm.expectedUnmarried !== undefined && confirm.expectedUnmarried !== now.unmarried;
      if (parentsChanged || flagChanged) return { ok: false, errors: [], needs: { stale: true, current: now, replaceParents: now.parents } };
    }
  }

  // Мягкие предупреждения: можно подтвердить.
  if (secondId) {
    if (ancestorsOf(people, firstId).has(secondId) || descendantsOf(people, firstId).has(secondId)) warnings.push("Второй родитель записан предком или потомком первого. Проверьте, что так и есть.");
  }
  const kid = childId ? byId.get(childId) : undefined;
  const kidYear = yearOf(kid?.birthYear ?? (child.mode === "new" ? child.person.birthYear : undefined));
  const parentYears = [first.birthYear, secondId ? byId.get(secondId)?.birthYear : newSecond?.birthYear].map((y) => yearOf(y));
  if (kidYear != null && parentYears.some((y) => y != null && y > kidYear)) warnings.push("Родитель записан младше ребёнка по годам рождения. Проверьте годы.");
  if (warnings.length && !confirm.warnings) return { ok: false, errors: [], needs: { warnings } };

  // Похожий человек вместо нового второго родителя.
  if (newSecond) {
    const similar = similarPeople(people, { firstName: newSecond.firstName ?? "", lastName: newSecond.lastName ?? "", birthYear: newSecond.birthYear ?? "" }).filter((p) => p.id !== firstId);
    if (similar.length && !confirm.notDuplicate) return { ok: false, errors: [], needs: { similar: similar.map((p) => p.id) } };
  }
  // Новый ребёнок, похожий на уже записанного ребёнка этого родителя.
  if (child.mode === "new") {
    const dup = similarPeople(people, { firstName: child.person.firstName ?? "", lastName: child.person.lastName ?? "", birthYear: child.person.birthYear ?? "" }).filter((p) => (p.parents ?? []).includes(firstId));
    if (dup.length && !confirm.notDuplicate) return { ok: false, errors: [], needs: { similar: dup.map((p) => p.id) } };
  }
  // Существующему ребёнку нельзя молча заменить родителей.
  if (kid && (kid.parents ?? []).filter((id) => !ghost(id)).length) {
    const wanted = new Set([firstId, ...(secondId ? [secondId] : [])]);
    const had = (kid.parents ?? []).filter((id) => !ghost(id));
    const differs = had.some((id) => !wanted.has(id)) || [...wanted].some((id) => !had.includes(id));
    if (differs && !confirm.replaceParents) return { ok: false, errors: [], needs: { replaceParents: had } };
  }

  const newSecondId = newSecond ? input.newId() : undefined;
  const secondFinal = secondId ?? newSecondId;
  const parents = secondFinal ? [firstId, secondFinal] : [firstId];
  // Между родителями нет записи супруга: общий ребёнок брак не создаёт, это помечаем у ребёнка.
  const married = secondFinal && !newSecond ? partnersOf(people, firstId).some((p) => p.id === secondFinal) : false;
  const unmarried = Boolean(secondFinal) && !married;

  const withFlag = <T extends object>(p: T): T => {
    const copy = { ...p } as T & { parentsUnmarried?: boolean };
    if (unmarried) copy.parentsUnmarried = true;
    else delete copy.parentsUnmarried;
    return copy;
  };

  let next = people;
  let outChildId: string;
  if (child.mode === "new") {
    outChildId = input.newId();
    next = [{ ...withFlag({ ...child.person }), id: outChildId, parents } as RodPerson, ...next];
  } else {
    outChildId = child.id;
    next = next.map((p) => (p.id === child.id ? ({ ...withFlag(p), parents } as RodPerson) : p));
  }
  if (newSecond && newSecondId) {
    const fresh: RodPerson = { ...newSecond, id: newSecondId } as RodPerson;
    delete (fresh as { spouse?: string }).spouse;
    delete (fresh as { moreSpouses?: unknown }).moreSpouses;
    delete (fresh as { spouseStatus?: string }).spouseStatus;
    next = [fresh, ...next];
  }
  return { ok: true, people: next, childId: outChildId, secondId: secondFinal };
}
