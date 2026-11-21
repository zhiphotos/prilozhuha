/** С-4б0: «читатель» не теряет чужие ключи верхнего уровня. Чистая логика ext.ts, без браузера и сети. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EXT_LIMIT, EXT_OVERFLOW_MESSAGE, ExtOverflowError, KNOWN_EXTRA, pickExt, readExt, withExt } from "./ext.ts";

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
test("09 опасные ключи и не-JSON значения не берутся", () => {
  const data = JSON.parse('{"__proto__":{"x":1},"constructor":2,"prototype":3,"ok":1}') as Record<string, unknown>;
  const r = pickExt({ ...data, fn: () => 1, undef: undefined }, KNOWN, {});
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
