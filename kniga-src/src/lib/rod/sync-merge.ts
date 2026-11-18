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
export type MergeReport = { added: Record<string, number>; differing: Record<string, number>; fromCloud: Record<string, number>; total: { added: number; differing: number; fromCloud: number } };

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

export function mergeBooks(local: Book, cloud: Book, base?: Book | null): { data: Book; report: MergeReport } {
  const data: Book = {};
  const added: Record<string, number> = {};
  const differing: Record<string, number> = {};
  const fromCloud: Record<string, number> = {};
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
        return choice === "theirs-differs" ? other : item;
      });
      const have = new Set(mine.map((item) => item.id));
      let a = 0;
      for (const item of theirs) {
        if (!have.has(item.id)) {
          out.push(item);
          a += 1;
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
  return { data, report: { added, differing, fromCloud, total: { added: sum(added), differing: sum(differing), fromCloud: sum(fromCloud) } } };
}
