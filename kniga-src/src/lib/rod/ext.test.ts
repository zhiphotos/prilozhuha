/** С-4б0: «читатель» не теряет чужие ключи верхнего уровня. Чистая логика ext.ts, без браузера и сети. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EXT_LIMIT, EXT_OVERFLOW_MESSAGE, EXT_UNSAFE_MESSAGE, ExtOverflowError, ExtUnsafeKeyError, KNOWN_EXTRA, pickExt, readExt, withExt } from "./ext.ts";

const KNOWN = ["people", "pages", "spine"] as const;

test("01 неизвестные ключи верхнего уровня попадают в ext, известные и room нет", () => {
  const r = pickExt({ people: [], pages: [], room: { id: "r" }, shelf: { a: 1 }, mood: "x" }, KNOWN, {});
  assert.deepEqual(r.ext, { shelf: { a: 1 }, mood: "x" });
  assert.deepEqual(r.dropped, []);
  assert.ok(KNOWN_EXTRA.includes("room"));
});
test("02 нет неизвестных ключей: ext пустой и withExt возвращает те же данные (отпечаток прежний)", () => {
  const data = { people: [1], pages: [] };
  assert.deepEqual(pickExt(data, KNOWN, {}).ext, {});
  assert.equal(withExt(data, {}), data);
  assert.equal(JSON.stringify(withExt(data, {})), JSON.stringify({ people: [1], pages: [] }));
});
test("03 withExt добавляет ключи после известных и не перекрывает известные", () => {
  const out = withExt({ people: [1], pages: [] }, { shelf: 1, people: "чужое" });
  assert.deepEqual(Object.keys(out), ["people", "pages", "shelf"]);
  assert.deepEqual(out.people, [1]);
});
test("04 без дублей: повторное чтение того же даёт то же самое; ключи уникальны", () => {
  const once = pickExt({ shelf: { a: 1 } }, KNOWN, {});
  const twice = pickExt({ shelf: { a: 1 } }, KNOWN, once.ext);
  assert.deepEqual(twice.ext, once.ext);
  assert.deepEqual(Object.keys(twice.ext), ["shelf"]);
});
test("05 новое значение того же ключа заменяет старое, ключ, которого нет во входе, остаётся", () => {
  const r = pickExt({ shelf: 2 }, KNOWN, { shelf: 1, other: true });
  assert.deepEqual(r.ext, { shelf: 2, other: true });
});
test("06 круг: чтение, отправка, чтение даёт те же данные", () => {
  const incoming = { people: [], future: { nested: [1, { z: 1 }] }, flag: null };
  const ext = pickExt(incoming, KNOWN, {}).ext;
  const sent = withExt({ people: [] }, ext);
  assert.deepEqual(pickExt(sent, KNOWN, {}).ext, ext);
  assert.equal(JSON.stringify(sent.future), JSON.stringify(incoming.future));
});
test("07 лимит размера: лишнее не берётся, уже сохранённое не теряется, о пропуске сообщается", () => {
  const big = "я".repeat(EXT_LIMIT);
  const r = pickExt({ small: "ok", huge: big }, KNOWN, { kept: "1" });
  assert.deepEqual(Object.keys(r.ext).sort(), ["kept", "small"]);
  assert.deepEqual(r.dropped, ["huge"]);
  assert.ok(JSON.stringify(r.ext).length <= EXT_LIMIT);
});
test("08 заменяемое значение, которое не влезает, оставляет прежнее", () => {
  const r = pickExt({ shelf: "x".repeat(EXT_LIMIT) }, KNOWN, { shelf: "старое" });
  assert.deepEqual(r.ext, { shelf: "старое" });
  assert.deepEqual(r.dropped, ["shelf"]);
});
test("09 не-JSON значения (функция, undefined) не данные и пропускаются; опасные имена не пропускаются молча, а отдаются в unsafe", () => {
  const data = JSON.parse('{"__proto__":{"x":1},"constructor":2,"prototype":3,"ok":1}') as Record<string, unknown>;
  const r = pickExt({ ...data, fn: () => 1, undef: undefined }, KNOWN, {});
  assert.deepEqual(r.unsafe.sort(), ["__proto__", "constructor", "prototype"]);
  assert.deepEqual(r.ext, { ok: 1 });
  assert.equal(({} as Record<string, unknown>).x, undefined);
});
test("10 входные данные и текущий ext не изменяются", () => {
  const current = { a: { b: 1 } };
  const incoming = { people: [], c: { d: 2 } };
  const snap = JSON.stringify([current, incoming]);
  pickExt(incoming, KNOWN, current);
  withExt(incoming, current);
  assert.equal(JSON.stringify([current, incoming]), snap);
});
test("11 ext.ts чистый: ничего не импортирует", () => {
  const src = readFileSync(new URL("./ext.ts", import.meta.url), "utf8");
  assert.equal(/^\s*import\s/m.test(src), false);
});

// ——— отказ вместо пропуска
// Счёт прежний: «{}» (2) + ключ в кавычках + значение в JSON + 2 запаса на ключ (двоеточие и запятая). Он никогда не меньше настоящего размера JSON.
const sized = (n: number) => "x".repeat(n - 9); // значение, при котором счёт для ключа k равен ровно n
test("20 граница: ровно EXT_LIMIT по счёту проходит, на символ больше отказ; настоящий размер JSON не больше лимита", () => {
  const ok = { k: sized(EXT_LIMIT) };
  assert.deepEqual(readExt(ok, KNOWN, {}), ok);
  assert.ok(JSON.stringify(ok).length <= EXT_LIMIT);
  assert.throws(() => readExt({ k: sized(EXT_LIMIT) + "x" }, KNOWN, {}), ExtOverflowError);
});
test("21 превышение: понятное сообщение человеку, имена ключей в ошибке", () => {
  try {
    readExt({ shelf: "я".repeat(EXT_LIMIT) }, KNOWN, {});
    assert.fail("должен был отказать");
  } catch (error) {
    assert.ok(error instanceof ExtOverflowError);
    assert.equal(error.message, EXT_OVERFLOW_MESSAGE);
    assert.deepEqual(error.keys, ["shelf"]);
    assert.match(error.message, /Обновите приложение/);
    assert.match(error.message, /не изменена/);
  }
});
test("22 замена существующего ключа: влезает в лимит с учётом освобождённого места, не влезает отказ", () => {
  const current = { k: sized(EXT_LIMIT - 10) };
  assert.deepEqual(readExt({ k: "короче" }, KNOWN, current), { k: "короче" });
  assert.throws(() => readExt({ k: sized(EXT_LIMIT) + "xxxxx" }, KNOWN, current), ExtOverflowError);
  assert.equal((current.k as string).length, sized(EXT_LIMIT - 10).length); // прежнее значение не тронуто
});
test("23 слияние: сохранённое здесь плюс пришедшее вместе больше лимита: отказ, ничего не обрезается", () => {
  const half = "x".repeat(Math.floor(EXT_LIMIT * 0.6));
  const current = { a: half };
  const incoming = { b: half };
  assert.throws(() => readExt(incoming, KNOWN, current), ExtOverflowError);
  assert.deepEqual(Object.keys(current), ["a"]);
});
test("24 один неподходящий ключ отказывает всей операции: годные ключи рядом тоже не берутся (без частичной записи)", () => {
  assert.throws(() => readExt({ good: 1, huge: "x".repeat(EXT_LIMIT) }, KNOWN, {}), ExtOverflowError);
});
test("25 без чужих ключей readExt возвращает текущий ext без изменений", () => {
  const current = { a: 1 };
  assert.deepEqual(readExt({ people: [] }, KNOWN, current), { a: 1 });
  assert.deepEqual(readExt({ people: [] }, KNOWN, {}), {});
});
test("26 известные ключи и room не могут попасть в ext и не считаются в лимит", () => {
  assert.deepEqual(readExt({ people: "я".repeat(EXT_LIMIT * 2), room: "я".repeat(EXT_LIMIT * 2) }, KNOWN, {}), {});
});

// ——— особые имена
const INHERITED = ["toString", "valueOf", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "__defineGetter__", "__lookupGetter__"];
const parse = (o: object) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>;
test("30 унаследованные от Object имена (toString, valueOf, hasOwnProperty…) сохраняются как обычные ключи без ошибки", () => {
  const incoming = Object.fromEntries(INHERITED.map((k, i) => [k, { n: i }]));
  const ext = readExt(parse({ people: [], ...incoming }), KNOWN, {});
  for (const k of INHERITED) assert.ok(Object.prototype.hasOwnProperty.call(ext, k), k);
  assert.deepEqual(ext, incoming);
  const sent = withExt({ people: [] }, ext);
  for (const k of INHERITED) assert.deepEqual(Object.getOwnPropertyDescriptor(sent, k)?.value, incoming[k], k);
  assert.deepEqual(JSON.parse(JSON.stringify(sent)), { people: [], ...incoming });
});
test("31 замена и повтор для унаследованных имён: значение заменяется, ключ один, размер не растёт", () => {
  const first = readExt(parse({ toString: "a" }), KNOWN, {});
  const second = readExt(parse({ toString: "b", valueOf: 1 }), KNOWN, first);
  assert.deepEqual(second, { toString: "b", valueOf: 1 });
  assert.deepEqual(readExt(parse({ toString: "b", valueOf: 1 }), KNOWN, second), second);
});
test("32 известное имя в данных, совпадающее с унаследованным: withExt не принимает унаследованное за «уже есть»", () => {
  const out = withExt({ people: [] }, parse({ toString: "x" }));
  assert.equal(Object.getOwnPropertyDescriptor(out, "toString")?.value, "x");
});
test("33 опасные имена: явный отказ ExtUnsafeKeyError с понятным текстом до любых изменений, соседние годные ключи тоже не берутся", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    const data = JSON.parse(`{"people":[],"good":1,${JSON.stringify(key)}:{"x":1}}`) as Record<string, unknown>;
    const current = { kept: 1 };
    try {
      readExt(data, KNOWN, current);
      assert.fail(`${key}: должен был отказать`);
    } catch (error) {
      assert.ok(error instanceof ExtUnsafeKeyError, key);
      assert.equal((error as Error).message, EXT_UNSAFE_MESSAGE);
      assert.match((error as Error).message, /Обновите приложение/);
      assert.match((error as Error).message, /не изменена/);
      assert.deepEqual((error as ExtUnsafeKeyError).keys, [key]);
    }
    assert.deepEqual(current, { kept: 1 });
  }
});
test("34 прототип не меняется ни при каких именах; Object.prototype чист", () => {
  const before = Object.getOwnPropertyNames(Object.prototype).sort().join();
  const ext = readExt(parse({ toString: 1, valueOf: 2 }), KNOWN, {});
  const out = withExt({ people: [] }, ext);
  assert.equal(Object.getPrototypeOf(ext), Object.prototype);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
  assert.equal(Object.getOwnPropertyNames(Object.prototype).sort().join(), before);
  assert.equal(typeof ({} as { toString: unknown }).toString, "function");
  assert.throws(() => readExt(JSON.parse('{"__proto__":{"polluted":1}}'), KNOWN, {}), ExtUnsafeKeyError);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});
