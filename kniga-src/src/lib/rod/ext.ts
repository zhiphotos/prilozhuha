/**
 * С-4б0: «читатель». Ключи верхнего уровня книги, которых эта версия приложения не знает (их пишет более новая версия),
 * не теряются: лежат в ext и уезжают дальше вместе с книгой (копия, облако, синхронизация).
 * Чистый модуль: ничего не импортирует. Эти данные никто не читает и не меняет, только хранит и отдаёт.
 */

/** Предел размера всех чужих ключей вместе (в символах JSON): защита от бесконтрольного роста хранилища и снимка. */
export const EXT_LIMIT = 256 * 1024;

/** Ключи, которые знает приложение, но они не входят в DATA_KEYS. room живёт отдельно (своя ссылка на устройстве не перезаписывается), в ext не попадает. */
export const KNOWN_EXTRA: readonly string[] = ["room"];

const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

/** Что видит человек, когда чужие данные не помещаются. Операция при этом не выполняется, книга не меняется. */
export const EXT_OVERFLOW_MESSAGE = "Эта книга сделана более новой версией приложения, и часть её данных не поместится в эту версию. Обновите приложение. Книга на этом устройстве и в облаке не изменена.";

/** Чужие данные не поместились в лимит: операция отменяется целиком до любых изменений. */
export class ExtOverflowError extends Error {
  keys: string[];
  constructor(keys: string[]) {
    super(EXT_OVERFLOW_MESSAGE);
    this.name = "ExtOverflowError";
    this.keys = keys;
  }
}

export type ExtResult = { ext: Record<string, unknown>; dropped: string[] };

/**
 * Выбирает из данных неизвестные ключи и добавляет их к уже сохранённым (одинаковый ключ = одна запись, без дублей).
 * Не влезло в лимит: новое не берём, прежнее значение остаётся; имена пропущенных ключей возвращаем в dropped.
 */
export function pickExt(data: Record<string, unknown>, known: readonly string[], current: Record<string, unknown>): ExtResult {
  const skip = new Set<string>([...known, ...KNOWN_EXTRA]);
  const ext: Record<string, unknown> = { ...current };
  const dropped: string[] = [];
  let total = JSON.stringify(ext).length;
  for (const key of Object.keys(data)) {
    if (skip.has(key) || UNSAFE.has(key)) continue;
    const value = data[key];
    if (value === undefined || typeof value === "function" || typeof value === "symbol") continue;
    let piece: string | undefined;
    try {
      piece = JSON.stringify(value);
    } catch {
      dropped.push(key);
      continue;
    }
    if (piece === undefined) continue;
    const cost = JSON.stringify(key).length + piece.length + 2;
    const had = key in ext ? JSON.stringify(key).length + JSON.stringify(ext[key]).length + 2 : 0;
    if (total - had + cost > EXT_LIMIT) {
      dropped.push(key);
      continue;
    }
    ext[key] = value;
    total += cost - had;
  }
  return { ext, dropped };
}

/** Как pickExt, но ничего не теряет молча: если хоть один ключ не поместился, бросает ExtOverflowError и ничего не возвращает. */
export function readExt(data: Record<string, unknown>, known: readonly string[], current: Record<string, unknown>): Record<string, unknown> {
  const { ext, dropped } = pickExt(data, known, current);
  if (dropped.length) throw new ExtOverflowError(dropped);
  return ext;
}

/** Добавляет чужие ключи к данным для отправки. Известные ключи не перекрываются; без ext возвращает те же данные (отпечаток не меняется). */
export function withExt(data: Record<string, unknown>, ext: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!ext) return data;
  const keys = Object.keys(ext).filter((key) => !(key in data) && !UNSAFE.has(key));
  if (!keys.length) return data;
  const out: Record<string, unknown> = { ...data };
  for (const key of keys) out[key] = ext[key];
  return out;
}
