// Адресное исправление связей после загрузки GEDCOM. Чистые функции: ничего не пишут сами и не удаляют людей.
// Зачем: при первых загрузках часть людей (без фамилии) записалась копией без номера из файла, а у детей остались старые родители (см. ged-match.ts: «связи не трогаем»).
// Здесь копии НЕ объединяются и НЕ удаляются: только переставляются связи у людей, чьё соответствие доказано файлом. Спорное остаётся как есть.
import type { Person as RodPerson } from "@/lib/rod/types";
import type { ImportedPerson } from "./gedImport.ts";

export type CopyConfidence = "high" | "medium" | "low" | "restore";

export type CopyVerdict = {
  /** Запись без номера файла. */
  id: string;
  name: string;
  /** Предполагаемый номер в файле. */
  key: string;
  confidence: CopyConfidence;
  /** Очки доказательств и их перечень: год рождения, пересечение родителей, супругов и детей, пол. */
  points: number;
  basis: string[];
  /** Чего не хватает или что противоречит. */
  gaps: string[];
  /** Смешанная запись: её связи принадлежат двум разным людям из файла. */
  mixed: boolean;
  candidates: string[];
};

export type RepairOp =
  | { type: "replaceParent"; from: string; to: string }
  | { type: "addParent"; to: string }
  | { type: "replaceSpouse"; from: string; to: string }
  | { type: "replaceMoreSpouse"; from: string; to: string }
  | { type: "restoreId"; key: string; source: string };

export type RepairChange = {
  id: string;
  kind: "parent-copy" | "spouse-copy" | "parent-nameless" | "parent-mixed" | "restore-id" | "parent-restored";
  personId: string;
  personName: string;
  gedKey: string;
  /** Что было и что станет, для показа человеку. */
  before: string;
  after: string;
  basis: string;
  /** Включено по умолчанию. Отключены случаи, где нужен отдельный выбор человека. */
  selected: boolean;
  op: RepairOp;
};

export type RepairPlan = { changes: RepairChange[]; verdicts: CopyVerdict[]; source: string | undefined };

const NO_NAME = /^(без имени)$/i;
const norm = (x: string) => x.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
const yearOf = (x?: string) => /(\d{4})/.exec(x ?? "")?.[1] ?? "";

function fullName(c: RodPerson): string {
  const parts = [c.firstName, c.patronymic, c.lastName].map((x) => (x ?? "").trim()).filter(Boolean);
  return parts.length ? parts.join(" ") : c.name;
}
function fileName(p: ImportedPerson): string {
  return [p.firstName, p.patronymic, p.lastName].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
}
export const isNameless = (c: RodPerson) => {
  const n = fullName(c).trim();
  return !n || NO_NAME.test(n);
};

type Index = {
  source: string;
  fileBy: Map<string, ImportedPerson>;
  kids: Map<string, Set<string>>;
  spouses: (key: string) => Set<string>;
  parents: (key: string) => Set<string>;
  real: Map<string, RodPerson>;
  byId: Map<string, RodPerson>;
};

function indexOf(current: RodPerson[], list: ImportedPerson[]): Index | null {
  const source = list.find((p) => p.source)?.source;
  if (!source) return null;
  const fileBy = new Map(list.map((p) => [p.key, p]));
  const kids = new Map<string, Set<string>>();
  for (const p of list) for (const k of p.parentKeys) kids.set(k, (kids.get(k) ?? new Set()).add(p.key));
  const spouses = (key: string) => {
    const p = fileBy.get(key);
    const s = new Set<string>();
    if (p?.spouseKey) s.add(p.spouseKey);
    for (const m of p?.moreSpouses ?? []) s.add(m.key);
    // обратная сторона: если у другого указан этот человек
    for (const q of list) if (q.spouseKey === key || (q.moreSpouses ?? []).some((m) => m.key === key)) s.add(q.key);
    return s;
  };
  const parents = (key: string) => new Set(fileBy.get(key)?.parentKeys ?? []);
  const real = new Map<string, RodPerson>();
  for (const c of current) if (c.gedId && c.gedSource === source && fileBy.has(c.gedId) && !real.has(c.gedId)) real.set(c.gedId, c);
  return { source, fileBy, kids: kids, spouses, parents, real, byId: new Map(current.map((c) => [c.id, c])) };
}

const appKids = (current: RodPerson[], id: string) => current.filter((c) => (c.parents ?? []).includes(id)).map((c) => c.id);
const appSpouses = (current: RodPerson[], id: string) => {
  const me = current.find((c) => c.id === id);
  const s = new Set<string>();
  if (me?.spouse) s.add(me.spouse);
  for (const m of me?.moreSpouses ?? []) s.add(m.id);
  for (const c of current) if (c.spouse === id || (c.moreSpouses ?? []).some((m) => m.id === id)) s.add(c.id);
  return s;
};

/** Кто из записей без номера – копия человека из файла, и насколько мы в этом уверены. Ничего не меняет. */
export function judgeCopies(current: RodPerson[], list: ImportedPerson[]): CopyVerdict[] {
  // Два прохода: сначала доказательства только от настоящих записей, потом добавляются копии, найденные на первом проходе (у копии бывают дети-копии).
  const first = judgeOnce(current, list, new Map());
  const provisional = new Map(first.filter((v) => v.confidence !== "low").map((v) => [v.id, v.key]));
  return judgeOnce(current, list, provisional);
}

function judgeOnce(current: RodPerson[], list: ImportedPerson[], provisional: Map<string, string>): CopyVerdict[] {
  const ix = indexOf(current, list);
  if (!ix) return [];
  const keyOfReal = new Map<string, string>();
  for (const [k, c] of ix.real) keyOfReal.set(c.id, k);
  for (const [id, k] of provisional) if (!keyOfReal.has(id)) keyOfReal.set(id, k);
  const keysOf = (ids: Iterable<string>) => new Set([...ids].map((i) => keyOfReal.get(i)).filter((k): k is string => Boolean(k)));
  const out: CopyVerdict[] = [];
  for (const g of current) {
    if (g.gedId || isNameless(g)) continue;
    const gName = norm(fullName(g));
    const cands = [...ix.fileBy.values()].filter((p) => norm(fileName(p)) === gName && (!yearOf(g.birthYear) || !yearOf(p.birthYear) || yearOf(g.birthYear) === yearOf(p.birthYear)) && (!g.gender || !p.gender || g.gender === p.gender));
    if (!cands.length) continue;
    const gp = keysOf(g.parents ?? []);
    const gs = keysOf(appSpouses(current, g.id));
    const gk = keysOf(appKids(current, g.id));
    const scored = cands.map((p) => {
      const basis: string[] = [];
      let pts = 0;
      if (yearOf(g.birthYear) && yearOf(g.birthYear) === yearOf(p.birthYear)) { pts += 2; basis.push("год рождения совпадает"); }
      const ov = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));
      if (ov(gp, ix.parents(p.key))) { pts += 1; basis.push("родитель совпадает"); }
      if (ov(gs, ix.spouses(p.key))) { pts += 1; basis.push("супруг совпадает"); }
      if (ov(gk, ix.kids.get(p.key) ?? new Set())) { pts += 1; basis.push("ребёнок совпадает"); }
      if (g.gender && g.gender === p.gender) { pts += 1; basis.push("пол совпадает"); }
      const gaps: string[] = [];
      if (!(yearOf(g.birthYear) && yearOf(p.birthYear))) gaps.push("нет года рождения для сравнения");
      const fp = ix.parents(p.key), fs = ix.spouses(p.key), fk = ix.kids.get(p.key) ?? new Set<string>();
      if (!fp.size) gaps.push("в файле нет родителей");
      if (!fs.size) gaps.push("в файле нет супруга");
      if (!fk.size) gaps.push("в файле нет детей");
      const badS = [...gs].some((x) => !fs.has(x));
      const badOther = [...gp].some((x) => !fp.has(x)) || [...gk].some((x) => !fk.has(x));
      return { p, pts, basis, gaps, badS, badOther };
    }).sort((a, b) => b.pts - a.pts);
    const top = scored[0]!;
    const tie = scored.length > 1 && scored[1]!.pts === top.pts;
    const hasReal = ix.real.has(top.p.key);
    const links = top.basis.filter((b) => !/пол совпадает/.test(b)).length;
    let confidence: CopyConfidence;
    if (!hasReal) confidence = links >= 2 && !top.badS && !top.badOther && !tie ? "restore" : "low";
    else if (top.badS || tie) confidence = "low";
    else if (top.badOther) confidence = "medium";
    else confidence = top.pts >= 3 ? "high" : "medium";
    const gaps = [...top.gaps];
    if (top.badS) gaps.push("у записи есть супруг, которого у этого человека в файле нет: смешанная запись двух людей");
    if (top.badOther && !top.badS) gaps.push("к записи привязан человек, которого у неё нет в файле: спорная связь, не трогаем");
    if (tie) gaps.push("два подходящих человека в файле: " + scored.filter((s) => s.pts === top.pts).map((s) => s.p.key).join(", "));
    out.push({ id: g.id, name: fullName(g), key: top.p.key, confidence, points: top.pts, basis: top.basis, gaps, mixed: top.badS && hasReal, candidates: scored.map((s) => s.p.key) });
  }
  return out;
}

const short = (c: RodPerson | undefined, id: string) => (c ? `${fullName(c) || c.name}${c.gedId ? ` (${c.gedId})` : " (без номера)"}` : id);

/** План исправлений: что поменять и почему. Применять только выбранное человеком (`selected`). */
export function planRepair(current: RodPerson[], list: ImportedPerson[]): RepairPlan {
  const ix = indexOf(current, list);
  const verdicts = judgeCopies(current, list);
  if (!ix) return { changes: [], verdicts, source: undefined };
  const byGhost = new Map(verdicts.map((v) => [v.id, v]));
  const changes: RepairChange[] = [];
  const keyOfReal = new Map<string, string>();
  for (const [k, c] of ix.real) keyOfReal.set(c.id, k);
  // ключ, который человек «представляет»: настоящая запись, копия высокой уверенности или смешанная копия (ключ неизвестен)
  const keyFor = (id: string): string | undefined => keyOfReal.get(id) ?? (byGhost.get(id)?.confidence === "high" ? byGhost.get(id)!.key : undefined);
  const realOf = (key: string) => ix.real.get(key);
  const add = (c: Omit<RepairChange, "id">) => changes.push({ ...c, id: `${c.kind}:${c.personId}:${"from" in c.op ? c.op.from : "to" in c.op ? c.op.to : "id"}` });

  for (const x of current) {
    const key = keyOfReal.get(x.id);
    if (!key) continue;
    const fp = ix.parents(key);
    // 1. родитель-копия → настоящий
    for (const q of x.parents ?? []) {
      const v = byGhost.get(q);
      if (!v) continue;
      if (v.confidence === "high" && fp.has(v.key)) {
        const target = realOf(v.key);
        if (target && !(x.parents ?? []).includes(target.id)) add({ kind: "parent-copy", personId: x.id, personName: fullName(x), gedKey: key, before: `родитель: ${short(ix.byId.get(q), q)}`, after: `родитель: ${short(target, target.id)}`, basis: `копия «${v.name}» совпала: ${v.basis.join(", ")}; в файле этот человек – родитель ${key}`, selected: true, op: { type: "replaceParent", from: q, to: target.id } });
      }
      // 2. смешанная запись: родитель заменяется только если файл однозначен (один недостающий родитель, он супруг оставшегося)
      if (v.mixed) {
        const rest = (x.parents ?? []).filter((id) => id !== q);
        const restKeys = new Set(rest.map((id) => keyFor(id)).filter((k): k is string => Boolean(k)));
        const missing = [...fp].filter((k) => !restKeys.has(k));
        const m = missing.length === 1 ? missing[0]! : undefined;
        const target = m ? realOf(m) : undefined;
        if (m && target && rest.length === 1 && [...restKeys].some((rk) => ix.spouses(m).has(rk)) && !(x.parents ?? []).includes(target.id)) {
          add({ kind: "parent-mixed", personId: x.id, personName: fullName(x), gedKey: key, before: `родитель: ${short(ix.byId.get(q), q)} (смешанная запись)`, after: `родитель: ${short(target, target.id)}`, basis: `в файле родители ${[...fp].join(" + ")}; второй родитель ${[...restKeys].join(", ")} состоит в браке с ${m}`, selected: false, op: { type: "replaceParent", from: q, to: target.id } });
        }
      }
    }
    // 3. потерянный безымянный родитель: в файле он есть, у ребёнка не записан; второй родитель – его супруг в файле
    const have = new Set((x.parents ?? []).map((id) => keyFor(id)).filter((k): k is string => Boolean(k)));
    if ((x.parents ?? []).length === 1) {
      for (const m of fp) {
        if (have.has(m)) continue;
        const target = realOf(m);
        if (!target || !isNameless(target) || !has2(ix, [...have], m)) continue;
        add({ kind: "parent-nameless", personId: x.id, personName: fullName(x), gedKey: key, before: "второй родитель не записан", after: `родитель: ${short(target, target.id)}`, basis: `в файле у ${key} родители ${[...fp].join(" + ")}; ${m} – супруг записанного родителя`, selected: true, op: { type: "addParent", to: target.id } });
      }
    }
    // 3б. у человека родителей нет совсем, а в файле он ребёнок одного родителя (так у Евдокии после возврата номера): достраиваем связь
    if (!(x.parents ?? []).length && fp.size === 1) {
      const m = [...fp][0]!;
      const target = realOf(m);
      if (target && target.id !== x.id) add({ kind: "parent-restored", personId: x.id, personName: fullName(x), gedKey: key, before: "родитель не записан", after: `родитель: ${short(target, target.id)}`, basis: `в файле у ${key} единственный родитель ${m}`, selected: true, op: { type: "addParent", to: target.id } });
    }
    // 4. супруг-копия → настоящий
    const swapSpouse = (from: string, more: boolean) => {
      const v = byGhost.get(from);
      if (!v || v.confidence !== "high" || !ix.spouses(key).has(v.key)) return;
      const target = realOf(v.key);
      if (!target || target.id === x.id) return;
      if (x.spouse === target.id || (x.moreSpouses ?? []).some((s) => s.id === target.id)) return;
      add({ kind: "spouse-copy", personId: x.id, personName: fullName(x), gedKey: key, before: `супруг: ${short(ix.byId.get(from), from)}`, after: `супруг: ${short(target, target.id)}`, basis: `копия «${v.name}» совпала: ${v.basis.join(", ")}`, selected: true, op: { type: more ? "replaceMoreSpouse" : "replaceSpouse", from, to: target.id } });
    };
    if (x.spouse) swapSpouse(x.spouse, false);
    for (const m of x.moreSpouses ?? []) swapSpouse(m.id, true);
  }

  // 5. восстановление номера (человек без копии в списке, например Евдокия) и его связь с родителем из файла
  for (const v of verdicts) {
    if (v.confidence !== "restore") continue;
    const g = ix.byId.get(v.id)!;
    add({ kind: "restore-id", personId: g.id, personName: fullName(g), gedKey: v.key, before: "номера файла нет", after: `номер ${v.key}, источник файла`, basis: `единственная запись этого человека, настоящей с номером ${v.key} в списке нет; ${v.basis.join(", ")}`, selected: true, op: { type: "restoreId", key: v.key, source: ix.source } });
    if (!(g.parents ?? []).length) {
      for (const m of ix.parents(v.key)) {
        const target = ix.real.get(m);
        if (target) add({ kind: "parent-restored", personId: g.id, personName: fullName(g), gedKey: v.key, before: "родитель не записан", after: `родитель: ${short(target, target.id)}`, basis: `в файле у ${v.key} единственный родитель ${m}`, selected: true, op: { type: "addParent", to: target.id } });
      }
    }
  }
  return { changes, verdicts, source: ix.source };
}

/** Второй родитель m в файле состоит в браке с одним из уже записанных родителей. */
function has2(ix: Index, keys: string[], m: string): boolean {
  const sp = ix.spouses(m);
  return keys.length > 0 && keys.some((k) => sp.has(k));
}

/** Запись о применённом изменении: по ней отмена возвращает только это изменение. */
export type RepairJournalEntry = { change: RepairChange; prevFromFile: boolean | undefined; hadParents: boolean };

/** Применить выбранные изменения. Каждое проверяется заново: если связь уже другая (человек успел поправить или уже применено), оно пропускается и в журнал не попадает. */
export function applyRepair(current: RodPerson[], changes: RepairChange[], selected?: Set<string>): { people: RodPerson[]; applied: number; skipped: string[]; journal: RepairJournalEntry[] } {
  const take = changes.filter((c) => (selected ? selected.has(c.id) : c.selected));
  const skipped: string[] = [];
  const journal: RepairJournalEntry[] = [];
  const people = current.map((p) => ({ ...p }));
  const at = new Map(people.map((p) => [p.id, p]));
  for (const c of take) {
    const p = at.get(c.personId);
    if (!p) { skipped.push(`${c.id}: человека нет`); continue; }
    const op = c.op;
    const prevFromFile = p.fromFile;
    const hadParents = p.parents !== undefined;
    if (op.type === "replaceParent") {
      const list = p.parents ?? [];
      if (!list.includes(op.from) || list.includes(op.to)) { skipped.push(`${c.id}: связь уже другая`); continue; }
      p.parents = list.map((id) => (id === op.from ? op.to : id));
    } else if (op.type === "addParent") {
      const list = p.parents ?? [];
      if (list.includes(op.to) || list.length >= 2) { skipped.push(`${c.id}: родитель уже есть или их двое`); continue; }
      p.parents = [...list, op.to];
    } else if (op.type === "replaceSpouse") {
      if (p.spouse !== op.from) { skipped.push(`${c.id}: супруг уже другой`); continue; }
      p.spouse = op.to;
    } else if (op.type === "replaceMoreSpouse") {
      const more = p.moreSpouses ?? [];
      if (!more.some((m) => m.id === op.from)) { skipped.push(`${c.id}: связь уже другая`); continue; }
      p.moreSpouses = more.map((m) => (m.id === op.from ? { ...m, id: op.to } : m));
    } else {
      if (p.gedId) { skipped.push(`${c.id}: номер уже есть`); continue; }
      p.gedId = op.key;
      p.gedSource = op.source;
      p.fromFile = true;
    }
    journal.push({ change: c, prevFromFile, hadParents });
  }
  return { people, applied: journal.length, skipped, journal };
}

/**
 * Отмена применённого исправления: возвращает только те изменения из журнала, которые всё ещё стоят так, как их поставило исправление.
 * Если человек после применения изменил эту связь сам, она остаётся его, а в `kept` записывается причина. Остальные правки человека не затрагиваются.
 */
export function revertRepair(current: RodPerson[], journal: RepairJournalEntry[]): { people: RodPerson[]; reverted: number; kept: string[] } {
  const people = current.map((p) => ({ ...p }));
  const at = new Map(people.map((p) => [p.id, p]));
  const kept: string[] = [];
  let reverted = 0;
  // с конца: если несколько изменений касались одного человека, они откатываются в обратном порядке
  for (const { change: c, prevFromFile, hadParents } of [...journal].reverse()) {
    const p = at.get(c.personId);
    if (!p) { kept.push(`${c.personName}: человека уже нет`); continue; }
    const op = c.op;
    if (op.type === "replaceParent") {
      const list = p.parents ?? [];
      if (!list.includes(op.to) || list.includes(op.from)) { kept.push(`${c.personName}: родителей вы изменили сами, оставила как у вас`); continue; }
      p.parents = list.map((id) => (id === op.to ? op.from : id));
    } else if (op.type === "addParent") {
      const list = p.parents ?? [];
      if (!list.includes(op.to)) { kept.push(`${c.personName}: родителей вы изменили сами, оставила как у вас`); continue; }
      p.parents = list.filter((id) => id !== op.to);
      if (!p.parents.length && !hadParents) delete p.parents;
    } else if (op.type === "replaceSpouse") {
      if (p.spouse !== op.to) { kept.push(`${c.personName}: супруга вы изменили сами, оставила как у вас`); continue; }
      p.spouse = op.from;
    } else if (op.type === "replaceMoreSpouse") {
      const more = p.moreSpouses ?? [];
      if (!more.some((m) => m.id === op.to)) { kept.push(`${c.personName}: супругов вы изменили сами, оставила как у вас`); continue; }
      p.moreSpouses = more.map((m) => (m.id === op.to ? { ...m, id: op.from } : m));
    } else {
      if (p.gedId !== op.key || p.gedSource !== op.source) { kept.push(`${c.personName}: номер файла вы изменили сами, оставила как у вас`); continue; }
      delete p.gedId;
      delete p.gedSource;
      if (prevFromFile === undefined) delete p.fromFile;
      else p.fromFile = prevFromFile;
    }
    reverted += 1;
  }
  return { people, reverted, kept };
}

/** Что не совпадает с файлом у людей с номером: родители. Для отчёта «что осталось». */
export function remainingParentMismatches(current: RodPerson[], list: ImportedPerson[]): { id: string; name: string; key: string; fileParents: string[]; appParents: string[] }[] {
  const ix = indexOf(current, list);
  if (!ix) return [];
  const idToKey = new Map<string, string>();
  for (const [k, c] of ix.real) idToKey.set(c.id, k);
  const out: { id: string; name: string; key: string; fileParents: string[]; appParents: string[] }[] = [];
  for (const [key, c] of ix.real) {
    const fp = [...ix.parents(key)].sort();
    const ap = (c.parents ?? []).map((id) => idToKey.get(id) ?? `копия:${id}`).sort();
    if (fp.length !== ap.length || fp.some((k, i) => k !== ap[i])) out.push({ id: c.id, name: fullName(c), key, fileParents: fp, appParents: ap });
  }
  return out;
}

/** Чем копия отличается от настоящей записи: ручные данные, которых у настоящей нет (фото, заметка, вложения, место рождения, смерть). Пустые копии можно оставлять, непустые нельзя трогать без проверки. */
export function auditCopy(copy: RodPerson, real: RodPerson | undefined): string[] {
  const own: string[] = [];
  if (copy.photo && copy.photo !== real?.photo) own.push("фото");
  if ((copy.attachments ?? []).length && (copy.attachments ?? []).length !== (real?.attachments ?? []).length) own.push("вложения");
  if (copy.notes?.trim() && copy.notes.trim() !== (real?.notes ?? "").trim()) own.push("заметка");
  if (copy.birthPlace && copy.birthPlace !== real?.birthPlace) own.push("место рождения");
  if (copy.deathYear && copy.deathYear !== real?.deathYear) own.push("год смерти");
  if (copy.maidenName?.trim() && copy.maidenName !== real?.maidenName) own.push("девичья фамилия");
  return own;
}
