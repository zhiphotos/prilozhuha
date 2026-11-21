/**
 * С-4б0: «читатель». Ключи верхнего уровня книги, которых эта версия приложения не знает (их пишет более новая версия),
 * не теряются: лежат в ext и уезжают дальше вместе с книгой (копия, облако, синхронизация).
 * Чистый модуль: ничего не импортирует. Эти данные никто не читает и не меняет, только хранит и отдаёт.
 */

/** Предел размера всех чужих ключей вместе (в символах JSON): защита от бесконтрольного роста хранилища и снимка. */
export const EXT_LIMIT = 256 * 1024;

/** Ключи, которые знает приложение, но они не входят в DATA_KEYS. room живёт отдельно (своя ссылка на устройстве не перезаписывается), в ext не попадает. */
export const KNOWN_EXTRA: readonly string[] = ["room"];

/** Имена, которые эта версия не берётся безопасно хранить во всех путях (копия, облако, объединение): вместо молчаливого пропуска операция отказывает. */
const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);

const hasOwn = (object: object, key: string) => Object.prototype.hasOwnProperty.call(object, key);
/** Запись собственного свойства, которая не обращается к прототипу (в отличие от object[key] = value). */
const put = (object: Record<string, unknown>, key: string, value: unknown) => {
  Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
};

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

/** Что видит человек, когда в книге есть ключи с именами, которые нельзя безопасно сохранить. Операция не выполняется, книга не меняется. */
export const EXT_UNSAFE_MESSAGE = "В этой книге есть данные с именами, которые эта версия приложения не умеет безопасно хранить. Обновите приложение. Книга на этом устройстве и в облаке не изменена.";

export class ExtUnsafeKeyError extends Error {
  keys: string[];
  constructor(keys: string[]) {
    super(EXT_UNSAFE_MESSAGE);
    this.name = "ExtUnsafeKeyError";
    this.keys = keys;
  }
}

export type ExtResult = { ext: Record<string, unknown>; dropped: string[]; unsafe: string[] };

/**
 * Выбирает из данных неизвестные ключи и добавляет их к уже сохранённым (одинаковый ключ = одна запись, без дублей).
 * Не влезло в лимит: новое не берём, прежнее значение остаётся; имена пропущенных ключей возвращаем в dropped.
 */
export function pickExt(data: Record<string, unknown>, known: readonly string[], current: Record<string, unknown>): ExtResult {
  const skip = new Set<string>([...known, ...KNOWN_EXTRA]);
  const ext: Record<string, unknown> = { ...current };
  const dropped: string[] = [];
  const unsafe: string[] = [];
  let total = JSON.stringify(ext).length;
  for (const key of Object.keys(data)) {
    if (skip.has(key)) continue;
    if (UNSAFE.has(key)) {
      unsafe.push(key);
      continue;
    }
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
    const had = hasOwn(ext, key) ? JSON.stringify(key).length + JSON.stringify(ext[key]).length + 2 : 0;
    if (total - had + cost > EXT_LIMIT) {
      dropped.push(key);
      continue;
    }
    put(ext, key, value);
    total += cost - had;
  }
  return { ext, dropped, unsafe };
}

/** Как pickExt, но ничего не теряет молча: не поместился ключ (ExtOverflowError) или имя нельзя безопасно хранить (ExtUnsafeKeyError): бросает ошибку и ничего не возвращает. */
export function readExt(data: Record<string, unknown>, known: readonly string[], current: Record<string, unknown>): Record<string, unknown> {
  const { ext, dropped, unsafe } = pickExt(data, known, current);
  if (unsafe.length) throw new ExtUnsafeKeyError(unsafe);
  if (dropped.length) throw new ExtOverflowError(dropped);
  return ext;
}

/** Добавляет чужие ключи к данным для отправки. Известные ключи не перекрываются; без ext возвращает те же данные (отпечаток не меняется). */
export function withExt(data: Record<string, unknown>, ext: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!ext) return data;
  const keys = Object.keys(ext).filter((key) => !hasOwn(data, key) && !UNSAFE.has(key));
  if (!keys.length) return data;
  const out: Record<string, unknown> = { ...data };
  for (const key of keys) put(out, key, ext[key]);
  return out;
}
