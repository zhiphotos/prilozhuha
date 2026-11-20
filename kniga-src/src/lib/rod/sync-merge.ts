/**
 * Объединение книги на этом устройстве и в облаке при конфликте. Ничего не удаляется и ничего не перезаписывается молча.
 * Если известна книга на момент последней синхронизации (base), каждая запись решается по тому, КТО её менял с тех пор:
 *  - менялась только в облаке: берётся облачная (на этом устройстве её не трогали, она просто устарела);
 *  - менялась только здесь: остаётся здешняя;
 *  - менялась и там, и там: остаётся та, которую правили позже (editedAt), а если времени нет, здешняя; облачная лежит в копии.
 * Без base: запись с разным содержимым решается по editedAt, а если его нет, остаётся версия этого устройства.
 * Записи, которых нет с одной стороны, берутся целиком (удаления не переносятся: потерять данные при объединении нельзя).
 * Всё остальное (настройки печати, шрифты, план): по тому же правилу «кто менял», без base версия этого устройства.
 */
export type MergeReport = {
  added: Record<string, number>;
  differing: Record<string, number>;
  fromCloud: Record<string, number>;
  total: { added: number; differing: number; fromCloud: number };
  /** Только если в книге есть усыновители или опекуны (adoptedBy, caredBy): сколько связей добавлено, снято по решению одного из устройств и сколько нужно проверить человеку. */
  relations?: { added: number; removed: number; toResolve: number };
  /** Только если что-то вернулось: записи, удалённые на этом устройстве и снова пришедшие из облака (удаление не переносится). Считаются и в `added`. */
  returned?: Record<string, number>;
};

type Book = Record<string, unknown>;
const isKeyed = (value: unknown): value is { id: string }[] => Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const editedAt = (item: unknown) => {
  const v = (item as { editedAt?: unknown } | undefined)?.editedAt;
  return typeof v === "number" ? v : 0;
};

/** Какую версию записи оставить, если здесь и в облаке она разная. */
function pick(mine: { id: string }, theirs: { id: string }, baseItem: { id: string } | undefined): "mine" | "theirs" | "mine-differs" | "theirs-differs" {
  if (baseItem) {
    if (same(mine, baseItem)) return "theirs"; // здесь не менялась: просто устарела
    if (same(theirs, baseItem)) return "mine"; // в облаке не менялась
  }
  // менялась с обеих сторон (или неизвестно, кто менял): позднее время правки, иначе версия этого устройства
  return editedAt(theirs) > editedAt(mine) ? "theirs-differs" : "mine-differs";
}

// Усыновители и опекуны сливаются отдельно от остальной карточки (см. mergeLinks): правка этих связей на одном устройстве не должна пропадать из-за правки заметки на другом.
const REL_KEYS = ["adoptedBy", "caredBy"] as const;
type Link = { id: string } & Record<string, unknown>;
const asLinks = (v: unknown): Link[] => (Array.isArray(v) ? v.filter((x): x is Link => !!x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string") : []);
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : x));
const eq = (a: unknown, b: unknown) => stable(a) === stable(b);

/**
 * Трёхстороннее слияние одного списка связей по id человека. `base`: список на момент последней синхронизации; null, если исходной карточки нет.
 * С основой: связь, снятая только на одном устройстве (на другом не менялась), снимается; добавленная только на одном остаётся; изменённая только на одном берётся оттуда;
 * правки с обеих сторон: остаётся моя, случай уходит в «нужно проверить». Без основы понять, снята связь намеренно или добавлена, нельзя:
 * сохраняются связи обеих сторон и каждое расхождение уходит в «нужно проверить». Молча связь не возвращается и не пропадает.
 */
export function mergeLinks(mine: Link[], theirs: Link[], base: Link[] | null): { list: Link[]; added: number; removed: number; toResolve: number } {
  const byId = (l: Link[]) => new Map(l.map((x) => [x.id, x]));
  const m = byId(mine);
  const t = byId(theirs);
  const b = base ? byId(base) : null;
  const out: Link[] = [];
  let added = 0;
  let removed = 0;
  let toResolve = 0;
  for (const id of new Set([...m.keys(), ...t.keys()])) {
    const a = m.get(id);
    const c = t.get(id);
    const o = b?.get(id);
    if (a && c) {
      if (eq(a, c)) out.push(a);
      else if (o && eq(a, o)) out.push(c);
      else if (o && eq(c, o)) out.push(a);
      else {
        out.push(a);
        toResolve += 1;
      }
    } else if (a) {
      if (!b) {
        out.push(a); // основы нет: добавили здесь или сняли в облаке, неизвестно
        toResolve += 1;
      } else if (!o) out.push(a); // добавлена здесь
      else if (eq(a, o)) removed += 1; // в облаке снята, здесь не менялась
      else {
        out.push(a);
        toResolve += 1; // здесь изменена, в облаке снята
      }
    } else if (c) {
      if (!b) {
        out.push(c);
        toResolve += 1;
      } else if (!o) {
        out.push(c);
        added += 1; // добавлена в облаке
      } else if (eq(c, o)) removed += 1; // здесь снята, в облаке не менялась
      else {
        out.push(c);
        toResolve += 1; // в облаке изменена, здесь снята
      }
    }
  }
  return { list: out, added, removed, toResolve };
}

/** Карточка с усыновителями и опекунами, слитыми по mergeLinks; остальное берётся из выбранной карточки. Если ни у кого нет этих полей, возвращается та же карточка. */
function withMergedLinks<T extends { id: string }>(chosen: T, mine: T, theirs: T, base: T | undefined, stat: { added: number; removed: number; toResolve: number }): T {
  const get = (x: T | undefined, k: string) => (x as Record<string, unknown> | undefined)?.[k];
  if (!REL_KEYS.some((k) => asLinks(get(mine, k)).length || asLinks(get(theirs, k)).length || asLinks(get(base, k)).length)) return chosen;
  const next: Record<string, unknown> = { ...chosen };
  for (const k of REL_KEYS) {
    const r = mergeLinks(asLinks(get(mine, k)), asLinks(get(theirs, k)), base ? asLinks(get(base, k)) : null);
    stat.added += r.added;
    stat.removed += r.removed;
    stat.toResolve += r.toResolve;
    if (r.list.length) next[k] = r.list;
    else delete next[k];
  }
  return next as T;
}

/** Строки для сообщения пользователю: пусто, если нет ни связей усыновления и опеки, ни вернувшихся записей. */
export function describeRelations(report: MergeReport): string {
  const parts: string[] = [];
  const r = report.relations;
  if (r && (r.added || r.removed)) parts.push(`Связи усыновления и опеки: добавлено ${r.added}${r.removed ? `, снято по решению одного из устройств ${r.removed}` : ""}.`);
  if (r?.toResolve) parts.push(`Нужно проверить связей усыновления и опеки: ${r.toResolve}. Оставлены обе версии: понять, снята связь намеренно или нет, нельзя.`);
  const back = report.returned?.people;
  if (back) parts.push(`Вернулись из облака люди, удалённые на этом устройстве: ${back} (удаление на другое устройство не переносится).`);
  return parts.length ? ` ${parts.join(" ")}` : "";
}

export function mergeBooks(local: Book, cloud: Book, base?: Book | null): { data: Book; report: MergeReport } {
  const data: Book = {};
  const added: Record<string, number> = {};
  const differing: Record<string, number> = {};
  const fromCloud: Record<string, number> = {};
  const returned: Record<string, number> = {};
  const rel = { added: 0, removed: 0, toResolve: 0 };
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const mine = local[key];
    const theirs = cloud[key];
    if (key in local && isKeyed(mine) && isKeyed(theirs)) {
      const baseList = base && isKeyed(base[key]) ? new Map((base[key] as { id: string }[]).map((item) => [item.id, item])) : new Map<string, { id: string }>();
      const theirById = new Map(theirs.map((item) => [item.id, item]));
      const out = mine.map((item) => {
        const other = theirById.get(item.id);
        if (!other || same(item, other)) return item;
        const choice = pick(item, other, baseList.get(item.id));
        if (choice === "mine") return item;
        if (choice === "theirs") {
          fromCloud[key] = (fromCloud[key] ?? 0) + 1;
          return other;
        }
        differing[key] = (differing[key] ?? 0) + 1;
        if (choice === "theirs-differs") fromCloud[key] = (fromCloud[key] ?? 0) + 1;
        const chosen = choice === "theirs-differs" ? other : item;
        return key === "people" ? withMergedLinks(chosen, item, other, baseList.get(item.id), rel) : chosen;
      });
      const have = new Set(mine.map((item) => item.id));
      let a = 0;
      for (const item of theirs) {
        if (!have.has(item.id)) {
          out.push(item);
          a += 1;
          if (baseList.has(item.id)) returned[key] = (returned[key] ?? 0) + 1; // была в книге на момент последней синхронизации, удалена здесь, вернулась из облака
        }
      }
      data[key] = out;
      if (a) added[key] = a;
    } else if (key in local && key in cloud && base && key in base) {
      // Не список записей (настройки, шрифты, план): берём то, что менялось.
      const b = base[key];
      if (same(mine, b)) {
        data[key] = theirs;
        if (!same(mine, theirs)) fromCloud[key] = 1;
      } else data[key] = mine;
    } else {
      data[key] = key in local ? mine : theirs;
      if (!(key in local) && isKeyed(theirs) && theirs.length) added[key] = theirs.length; // список есть только в облаке: все его записи новые для этого устройства
    }
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((n, v) => n + v, 0);
  const report: MergeReport = { added, differing, fromCloud, total: { added: sum(added), differing: sum(differing), fromCloud: sum(fromCloud) } };
  if (rel.added || rel.removed || rel.toResolve) report.relations = rel;
  if (sum(returned)) report.returned = returned;
  return { data, report };
}
