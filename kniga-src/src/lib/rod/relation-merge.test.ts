// Слияние связей усыновления и опеки (mergeLinks, mergeBooks): единичные случаи, свойства и сравнение со старой версией на книгах без новых полей.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { mergeBooks as legacyMerge } from "./sync-merge-legacy.oracle.ts";
import { mergeBooks, mergeLinks } from "./sync-merge.ts";

const L = (id: string, year?: string) => (year ? { id, year } : { id });

test("mergeLinks с основой: добавление, снятие, изменение, правки с обеих сторон", () => {
  const base = [L("a", "1"), L("b")];
  // добавили здесь, добавили там: объединение по id
  assert.deepEqual(mergeLinks([...base, L("c")], [...base, L("d")], base), { list: [L("a", "1"), L("b"), L("c"), L("d")], added: 1, removed: 0, toResolve: 0 });
  // сняли здесь, там не менялось: снято
  assert.deepEqual(mergeLinks([L("a", "1")], base, base), { list: [L("a", "1")], added: 0, removed: 1, toResolve: 0 });
  // сняли там, здесь не менялось: снято
  assert.deepEqual(mergeLinks(base, [L("b")], base), { list: [L("b")], added: 0, removed: 1, toResolve: 0 });
  // изменили только там: берётся облачная
  assert.deepEqual(mergeLinks(base, [L("a", "2"), L("b")], base).list, [L("a", "2"), L("b")]);
  // изменили с обеих сторон по-разному: остаётся моя, нужно проверить
  const r = mergeLinks([L("a", "2"), L("b")], [L("a", "3"), L("b")], base);
  assert.deepEqual(r.list, [L("a", "2"), L("b")]);
  assert.equal(r.toResolve, 1);
  // здесь изменили, там сняли: остаётся, нужно проверить (и наоборот)
  assert.equal(mergeLinks([L("a", "2"), L("b")], [L("b")], base).toResolve, 1);
  assert.equal(mergeLinks([L("b")], [L("a", "2"), L("b")], base).toResolve, 1);
});

test("mergeLinks без основы: сохраняются связи обеих сторон, каждое расхождение в «нужно проверить»", () => {
  const r = mergeLinks([L("a")], [L("a"), L("b")], null);
  assert.deepEqual(r.list, [L("a"), L("b")]);
  assert.equal(r.toResolve, 1);
  assert.deepEqual(mergeLinks([L("a")], [L("a")], null), { list: [L("a")], added: 0, removed: 0, toResolve: 0 });
  assert.equal(mergeLinks([], [L("a")], null).toResolve, 1);
});

test("mergeLinks: порядок ключей в записи не создаёт ложных расхождений", () => {
  const a = [{ id: "x", role: "guardian", from: "1" }];
  const b = [{ from: "1", role: "guardian", id: "x" }];
  assert.deepEqual(mergeLinks(a, b, a), { list: a, added: 0, removed: 0, toResolve: 0 });
});

test("mergeLinks, свойства на 2000 случайных наборов: нет дубликатов, ничего не появляется из воздуха, при равных списках результат тот же", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pool = ["a", "b", "c", "d", "e"];
  const pick = () => pool.filter(() => rnd() < 0.5).map((id) => L(id, rnd() < 0.3 ? "y" : undefined));
  for (let i = 0; i < 2000; i += 1) {
    const m = pick();
    const t = pick();
    const b = rnd() < 0.3 ? null : pick();
    const r = mergeLinks(m, t, b);
    const idsOut = r.list.map((x) => x.id);
    assert.equal(new Set(idsOut).size, idsOut.length, "нет дубликатов");
    for (const id of idsOut) assert.ok(m.some((x) => x.id === id) || t.some((x) => x.id === id), "только то, что было на одной из сторон");
    assert.deepEqual(mergeLinks(m, m, b).list, m, "одинаковые списки не меняются");
    if (!b) for (const x of [...m, ...t]) assert.ok(idsOut.includes(x.id), "без основы не теряется ни одна связь");
  }
});

// Старые книги: на книгах без новых полей результат совпадает с прежней версией слияния (эталон sync-merge-legacy.oracle.ts).
const books = ["diag-1029-anon.json", "diag-1101-anon.json"].map((n) => (JSON.parse(readFileSync(fileURLToPath(new URL(`../tree/fixtures/${n}`, import.meta.url)), "utf8")) as { people: { id: string }[] }).people);

test("старые книги: 600 случайных объединений дают тот же результат, что прежняя версия (данные и отчёт)", () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const mutate = (people: Record<string, unknown>[]) => {
    let out = people.map((p) => ({ ...p }));
    for (const p of out) {
      const r = rnd();
      if (r < 0.15) p.notes = `n${Math.floor(rnd() * 5)}`;
      else if (r < 0.25) p.birthYear = String(1900 + Math.floor(rnd() * 5));
      else if (r < 0.3) p.editedAt = Math.floor(rnd() * 5);
    }
    if (rnd() < 0.3) out = out.filter(() => rnd() > 0.1);
    if (rnd() < 0.3) out.push({ id: `new${Math.floor(rnd() * 3)}`, name: "x" });
    return out;
  };
  let withReturned = 0;
  for (let i = 0; i < 600; i += 1) {
    const base = { people: books[i % 2]! as Record<string, unknown>[], places: [{ id: "p1", name: "a" }] };
    const local = { ...base, people: mutate(base.people) };
    const cloud = { ...base, people: mutate(base.people) };
    const useBase = rnd() < 0.7 ? base : null;
    const a = mergeBooks(local, cloud, useBase);
    const b = legacyMerge(local, cloud, useBase);
    assert.equal(JSON.stringify(a.data), JSON.stringify(b.data), `данные, случай ${i}`);
    const { returned, relations, ...rest } = a.report;
    assert.equal(relations, undefined, "у старых книг нет строк про связи");
    assert.equal(JSON.stringify(rest), JSON.stringify(b.report), `отчёт, случай ${i}`);
    if (returned) withReturned += 1;
  }
  assert.ok(withReturned > 0, "случаи «вернулся из облака» в выборке есть и считаются отдельно");
});
