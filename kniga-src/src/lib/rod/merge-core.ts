/**
 * Общее ядро трёхстороннего слияния записей по полям (С-3б).
 * Чистый модуль: без браузера, сети, хранилища и серверной части, ничего не импортирует.
 * Пока нигде не подключён: действующие reviewChanges, judge, helperRoundWith, mergeBooks работают по-прежнему сами.
 *
 * Три стороны: base (общая прежняя версия), ours (книга того, кто решает, обычно владельца), theirs (присланная правка).
 *
 * Правила для записи с общим id:
 *   поле одинаково с обеих сторон                       -> берётся оно;
 *   поле менял только один                              -> берётся изменённое;
 *   поле менялось с обеих сторон по-разному             -> КОНФЛИКТ поля: в результате остаётся значение ours, значение theirs сохранено;
 *   запись есть с двух сторон, а в base её не было      -> если записи одинаковы, ничего; если разные, КОНФЛИКТ «add-add», записи не смешиваются;
 *   theirs убрал, ours не менял                         -> «remove»: предложение убрать, применять только после подтверждения;
 *   theirs убрал, ours правил                           -> КОНФЛИКТ «delete-edit»: запись остаётся, правка ours и удаление хранятся вместе;
 *   ours убрал, theirs правил                           -> КОНФЛИКТ «edit-after-delete»: запись НЕ воскрешается сама, правка theirs целиком хранится в конфликте;
 *   ours убрал, theirs не менял; оба убрали             -> ничего.
 * Вложенные значения (списки, объекты) сравниваются и слияются по верхнему полю целиком, части массивов и объектов не смешиваются.
 * Сравнение не зависит от порядка ключей объектов. Неизвестные поля обрабатываются так же, как известные, поэтому не теряются.
 * Поле «id» не участвует в слиянии: запись находится по id и сохраняет его.
 * Любое решение (decide) идемпотентно: повторное применение того же решения даёт тот же список. Копия получает id из содержимого, а не случайный.
 */

export type Rec = { id: string } & Record<string, unknown>;
export type Book = Partial<Record<string, unknown>>;

/** JSON с отсортированными ключами на любой глубине. undefined в объекте = поля нет, как в JSON. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return "∅";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "∅";
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : stableStringify(v))).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Равенство значений без зависимости от порядка ключей. undefined (поля нет) отличается от null и от пустой строки. */
export const valueEqual = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b);

const clone = <T,>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export type FieldConflict = { field: string; base: unknown; ours: unknown; theirs: unknown };
export type ConflictKind = "fields" | "add-add" | "delete-edit" | "edit-after-delete";
export type MergeStatus = "same" | "take" | "remove" | "conflict";

export type RecordMerge = {
  id: string;
  /**
   * same: делать нечего. take: из theirs пришло чистое изменение (добавление или поля), его можно применять.
   * remove: theirs предлагает убрать запись, ours её не менял: применять только после подтверждения.
   * conflict: см. kind, обе версии сохранены в base/ours/theirs.
   */
  status: MergeStatus;
  kind?: ConflictKind;
  base?: Rec;
  ours?: Rec;
  theirs?: Rec;
  /** Что получится в книге ours, если применить чистые изменения; конфликты и удаления не применены. undefined: записи у ours нет. */
  merged?: Rec;
  /** Поля: спорные (kind «fields») или различающиеся (kind «add-add»). */
  fields: FieldConflict[];
};

const fieldsOf = (...recs: (Rec | undefined)[]): string[] => {
  const set = new Set<string>();
  for (const rec of recs) for (const key of Object.keys(rec ?? {})) if (key !== "id") set.add(key);
  return [...set];
};

/** Слияние одной записи. Входные записи не изменяются. */
export function mergeRecord(id: string, base: Rec | undefined, ours: Rec | undefined, theirs: Rec | undefined): RecordMerge {
  const out = (m: Partial<RecordMerge> & { status: MergeStatus }): RecordMerge => ({ id, base: clone(base), ours: clone(ours), theirs: clone(theirs), fields: [], ...m });
  if (!ours && !theirs) return out({ status: "same" });
  if (!base) {
    if (!ours) return out({ status: "take", merged: clone(theirs) }); // их добавление
    if (!theirs || valueEqual(ours, theirs)) return out({ status: "same", merged: clone(ours) });
    const fields = fieldsOf(ours, theirs)
      .filter((f) => !valueEqual(ours[f], theirs[f]))
      .map((field) => ({ field, base: undefined, ours: clone(ours[field]), theirs: clone(theirs[field]) }));
    return out({ status: "conflict", kind: "add-add", merged: clone(ours), fields }); // одинаковый id у разных записей: не затираем и не смешиваем
  }
  if (!ours) {
    if (!theirs || valueEqual(theirs, base)) return out({ status: "same" }); // владелец убрал, они не менялись или тоже убрали
    return out({ status: "conflict", kind: "edit-after-delete" }); // запись не воскрешается: правка хранится в theirs
  }
  if (!theirs) {
    if (valueEqual(ours, base)) return out({ status: "remove", merged: clone(ours) });
    return out({ status: "conflict", kind: "delete-edit", merged: clone(ours) });
  }
  // запись есть у всех трёх: по полям
  const merged: Rec = { ...clone(ours) };
  const conflicts: FieldConflict[] = [];
  for (const f of fieldsOf(base, ours, theirs)) {
    const b = base[f];
    const o = ours[f];
    const t = theirs[f];
    let take = o;
    if (valueEqual(o, t)) take = o;
    else if (valueEqual(b, o)) take = t;
    else if (valueEqual(b, t)) take = o;
    else conflicts.push({ field: f, base: clone(b), ours: clone(o), theirs: clone(t) });
    if (take === undefined) delete merged[f];
    else merged[f] = clone(take);
  }
  merged.id = ours.id;
  if (conflicts.length) return out({ status: "conflict", kind: "fields", merged, fields: conflicts });
  return out({ status: valueEqual(merged, ours) ? "same" : "take", merged });
}

const isRecs = (v: unknown): v is Rec[] => Array.isArray(v) && v.every((x) => x && typeof x === "object" && typeof (x as Rec).id === "string");
const recs = (v: unknown): Rec[] => (isRecs(v) ? v : []);

export type ListMerge = {
  items: RecordMerge[];
  /** Список ours с применёнными чистыми изменениями, в том числе чистыми полями записей с конфликтом других полей. Удаления и сами конфликтные значения не применены (там остаётся ours). Порядок: записи ours, потом новые от theirs. */
  merged: Rec[];
  conflicts: RecordMerge[];
  /** Предложения убрать записи (ждут подтверждения). */
  removals: RecordMerge[];
};

/** Слияние списка записей (люди, места, истории...). */
export function mergeList(base: unknown, ours: unknown, theirs: unknown): ListMerge {
  const b = new Map(recs(base).map((r) => [r.id, r]));
  const o = new Map(recs(ours).map((r) => [r.id, r]));
  const t = new Map(recs(theirs).map((r) => [r.id, r]));
  const ids = [...new Set([...o.keys(), ...t.keys(), ...b.keys()])];
  const items = ids.map((id) => mergeRecord(id, b.get(id), o.get(id), t.get(id)));
  const byId = new Map(items.map((m) => [m.id, m]));
  const merged: Rec[] = [];
  for (const rec of recs(ours)) {
    const m = byId.get(rec.id)!;
    const clean = (m.status === "take" || (m.status === "conflict" && m.kind === "fields")) && m.merged; // чистое от theirs не теряется и при конфликте других полей
    merged.push(clean ? (m.merged as Rec) : clone(rec));
  }
  for (const r of recs(theirs)) {
    const m = byId.get(r.id)!;
    if (m.status === "take" && !o.has(r.id) && m.merged) merged.push(m.merged);
  }
  return { items, merged, conflicts: items.filter((m) => m.status === "conflict"), removals: items.filter((m) => m.status === "remove") };
}

/** Слияние по ключам книги. Ключи без списка записей пропускаются (их слияние вне этого ядра). */
export function mergeBook(base: Book, ours: Book, theirs: Book, keys: readonly string[]): Record<string, ListMerge> {
  return Object.fromEntries(keys.map((k) => [k, mergeList(base[k], ours[k], theirs[k])]));
}

/** Устойчивый отпечаток содержимого: два независимых 32-битных хэша (djb2 и FNV-1a) от стабильной записи. */
export const fingerprint = (value: unknown): string => {
  const text = stableStringify(value);
  let a = 5381;
  let b = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = ((a << 5) + a + c) | 0;
    b = Math.imul(b ^ c, 0x01000193);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
};

export type Decision = "ours" | "theirs" | "copy";

const put = (list: Rec[], rec: Rec): Rec[] => (list.some((r) => r.id === rec.id) ? list.map((r) => (r.id === rec.id ? rec : r)) : [...list, rec]);
const drop = (list: Rec[], id: string): Rec[] => list.filter((r) => r.id !== id);

/**
 * Копия записи theirs для решения «Обе копией». id из содержимого (не случайный).
 * Настоящие поля name и title НЕ меняются: пометка лежит отдельными полями copyOf (id исходной записи) и copyLabel.
 * Как показывать пометку человеку, решает экран, который потом подключит ядро.
 */
export function copyOf(theirs: Rec, label = "от помощника"): Rec {
  return { ...clone(theirs), id: `${theirs.id}-c${fingerprint(theirs)}`, copyOf: theirs.id, copyLabel: label };
}

/**
 * Применяет решение по одной записи к списку ours. Не мутирует вход. Идемпотентно.
 *  ours: оставить как есть.
 *  theirs: взять правку (поля, добавление, восстановление записи с тем же id, подтверждённое удаление).
 *  copy: ours остаётся, версия theirs добавляется отдельной записью с новым устойчивым id; если запись theirs отсутствует (удаление), ничего не добавляется.
 */
export function decide(list: Rec[], m: RecordMerge, decision: Decision, label?: string): Rec[] {
  const current = list.map(clone);
  if (decision === "ours") {
    if (m.status === "conflict" && m.kind === "fields" && m.merged) return put(current, applyFields(current.find((r) => r.id === m.id), m, false)); // наше остаётся в спорном, чистое от theirs не теряется
    return current;
  }
  if (decision === "copy") {
    if (!m.theirs) return current;
    const copy = copyOf(m.theirs, label);
    // Копия никогда не перезаписывает чужую запись и не теряется: если такой id занят записью с другим содержимым, берётся следующий (-2, -3...).
    // Если там уже лежит ровно эта копия, ничего не добавляется (повторное применение).
    for (let n = 1; n < 1000; n += 1) {
      const id = n === 1 ? copy.id : `${copy.id}-${n}`;
      const taken = current.find((r) => r.id === id);
      if (!taken) return [...current, { ...copy, id }];
      if (valueEqual(taken, { ...copy, id })) return current;
    }
    throw new Error("merge-core: не удалось подобрать свободный id для копии");
  }
  // theirs
  if (m.status === "remove" || (m.status === "conflict" && m.kind === "delete-edit")) return drop(current, m.id);
  if (m.status === "take") return m.merged ? put(current, applyFields(current.find((r) => r.id === m.id), m, false)) : current;
  if (m.status === "conflict") {
    if (m.kind === "fields") return put(current, applyFields(current.find((r) => r.id === m.id), m, true));
    if ((m.kind === "add-add" || m.kind === "edit-after-delete") && m.theirs) return put(current, clone(m.theirs)); // тот же id
  }
  return current;
}

/**
 * Чистые изменения слияния накладываются на ТЕКУЩУЮ запись, а не заменяют её: поле, которое после слияния успели изменить, не затирается.
 * Спорные поля берутся у theirs только по решению «theirs».
 */
function applyFields(cur: Rec | undefined, m: RecordMerge, takeConflicts: boolean): Rec {
  const rec: Rec = clone(cur ?? m.merged ?? (m.ours as Rec));
  const names = new Set<string>();
  for (const r of [m.base, m.ours, m.theirs, m.merged]) for (const k of Object.keys(r ?? {})) if (k !== "id") names.add(k);
  for (const f of names) {
    const conflict = m.fields.find((c) => c.field === f);
    const target = conflict ? (takeConflicts ? conflict.theirs : undefined) : m.merged?.[f];
    if (conflict && !takeConflicts) continue; // «ours»: спорное остаётся нашим
    if (!conflict && !valueEqual(rec[f], m.ours?.[f])) continue; // поле изменили после слияния: не затираем
    if (target === undefined) delete rec[f];
    else rec[f] = clone(target);
  }
  return rec;
}
