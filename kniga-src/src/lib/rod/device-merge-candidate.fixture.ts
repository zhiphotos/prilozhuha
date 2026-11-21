/**
 * Кандидат на слияние устройств (С-4а, дополнение). ТОЛЬКО для исследования в тестах: приложением не используется, mergeBooks не заменяет.
 * Правила (решения Дарины): без выбора по editedAt; пустое новое устройство берёт облако целиком; записи сравниваются по id;
 * одинаковые id с разным содержимым = конфликт, обе версии сохраняются; запись только с одной стороны не теряется;
 * настройки: облачное значение, если локальное точно равно значению по умолчанию; разные непустые = конфликт;
 * удаление определяется сравнением с базой; массовое удаление (больше 20 записей или больше 50% записей) ждёт подтверждения.
 */
import { mergeList, stableStringify, valueEqual, type Rec, type RecordMerge } from "./merge-core.ts";

export type Book = Record<string, unknown>;
export type Conflict = { key: string; id?: string; kind: string; ours?: unknown; theirs?: unknown };
export type CandidateResult = { data: Book; conflicts: Conflict[]; pendingRemovals: { key: string; id: string }[]; needsConfirm: boolean; mode: "empty-device" | "no-base" | "base" };

const isRecs = (v: unknown): v is Rec[] => Array.isArray(v) && v.every((x) => x && typeof x === "object" && typeof (x as Rec).id === "string");
const strip = (r: Rec): Rec => {
  const { editedAt: _e, ...rest } = r as Rec & { editedAt?: unknown };
  return rest as Rec;
};
const stripAll = (list: unknown): unknown => (isRecs(list) ? list.map(strip) : list);
const maxEdited = (...recs: (Rec | undefined)[]) => Math.max(0, ...recs.map((r) => (typeof (r as { editedAt?: unknown } | undefined)?.editedAt === "number" ? ((r as unknown as { editedAt: number }).editedAt) : 0)));

export function isDefault(value: unknown, def: unknown): boolean {
  return valueEqual(value, def);
}

export function candidateMerge(local: Book, cloud: Book, base: Book | null, defaults: Book, isEmptyDevice: boolean): CandidateResult {
  if (isEmptyDevice) return { data: { ...cloud }, conflicts: [], pendingRemovals: [], needsConfirm: false, mode: "empty-device" };
  const data: Book = {};
  const conflicts: Conflict[] = [];
  const pendingRemovals: { key: string; id: string }[] = [];
  let baseTotal = 0;
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const mine = local[key];
    const theirs = cloud[key];
    if (isRecs(mine) && isRecs(theirs)) {
      const b = base ? stripAll(base[key]) : undefined;
      const result = mergeList(base ? b : undefined, stripAll(mine), stripAll(theirs));
      baseTotal += isRecs(b) ? b.length : 0;
      const byId = new Map(result.items.map((m) => [m.id, m]));
      const edited = new Map<string, number>();
      const all = [...mine, ...theirs];
      for (const r of all) edited.set(r.id, maxEdited(mine.find((x) => x.id === r.id), theirs.find((x) => x.id === r.id)));
      data[key] = result.merged.map((r) => (edited.get(r.id) ? { ...r, editedAt: edited.get(r.id) } : r));
      for (const m of result.conflicts) conflicts.push({ key, id: m.id, kind: m.kind!, ours: m.ours, theirs: m.theirs });
      for (const m of result.removals) pendingRemovals.push({ key, id: m.id });
      void byId;
    } else if (key in local && key in cloud) {
      const def = defaults[key];
      const b = base?.[key];
      if (valueEqual(mine, theirs)) data[key] = mine;
      else if (base && key in base) {
        if (valueEqual(mine, b)) data[key] = theirs; // здесь не менялось
        else if (valueEqual(theirs, b)) data[key] = mine; // в облаке не менялось
        else {
          data[key] = mine;
          conflicts.push({ key, kind: "setting", ours: mine, theirs });
        }
      } else if (isDefault(mine, def)) data[key] = theirs;
      else if (isDefault(theirs, def)) data[key] = mine;
      else {
        data[key] = mine;
        conflicts.push({ key, kind: "setting", ours: mine, theirs });
      }
    } else data[key] = key in local ? mine : theirs; // есть только с одной стороны: не теряем
  }
  // Удаления применяются только с базой; массовые ждут подтверждения.
  const needsConfirm = pendingRemovals.length > 20 || (baseTotal > 0 && pendingRemovals.length / baseTotal > 0.5);
  if (!needsConfirm) for (const r of pendingRemovals) data[r.key] = (data[r.key] as Rec[]).filter((x) => x.id !== r.id);
  return { data, conflicts, pendingRemovals, needsConfirm, mode: base ? "base" : "no-base" };
}

export const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);
export type { RecordMerge };
