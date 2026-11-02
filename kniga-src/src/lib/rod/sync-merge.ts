/**
 * Объединение книги на этом устройстве и в облаке при конфликте. Ничего не удаляется и ничего не перезаписывается молча:
 *  - списки записей с id (люди, места, фото, страницы, заметки и т.д.): берутся все записи с обеих сторон; запись с одним id
 *    и разным содержимым остаётся в версии ЭТОГО устройства (расхождения считаются и показываются человеку);
 *  - всё остальное (настройки печати, шрифты, план): версия этого устройства; чего здесь нет, берётся из облака.
 * Удаления не переносятся: человек, удалённый на одном устройстве, вернётся из другого (потерять данные при объединении нельзя).
 */
export type MergeReport = { added: Record<string, number>; differing: Record<string, number>; total: { added: number; differing: number } };

type Book = Record<string, unknown>;
const isKeyed = (value: unknown): value is { id: string }[] => Array.isArray(value) && value.every((item) => item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string");

export function mergeBooks(local: Book, cloud: Book): { data: Book; report: MergeReport } {
  const data: Book = {};
  const added: Record<string, number> = {};
  const differing: Record<string, number> = {};
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    const mine = local[key];
    const theirs = cloud[key];
    if (key in local && isKeyed(mine) && isKeyed(theirs)) {
      const byId = new Map(mine.map((item) => [item.id, item]));
      const out = [...mine];
      let a = 0;
      let d = 0;
      for (const item of theirs) {
        const same = byId.get(item.id);
        if (!same) {
          out.push(item);
          a += 1;
        } else if (JSON.stringify(same) !== JSON.stringify(item)) d += 1;
      }
      data[key] = out;
      if (a) added[key] = a;
      if (d) differing[key] = d;
    } else {
      data[key] = key in local ? mine : theirs;
      if (!(key in local) && isKeyed(theirs) && theirs.length) added[key] = theirs.length; // список есть только в облаке: все его записи новые для этого устройства
    }
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((n, v) => n + v, 0);
  return { data, report: { added, differing, total: { added: sum(added), differing: sum(differing) } } };
}
