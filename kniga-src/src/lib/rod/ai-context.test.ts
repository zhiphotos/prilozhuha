import assert from "node:assert/strict";
import test from "node:test";
import { CONTEXT_LIMIT, buildTreeContext } from "./ai-context.ts";
import type { Person, Place } from "./types.ts";

const P = (id: string, name: string, extra: Partial<Person> = {}): Person => ({ id, name, relation: "", birthYear: "", maidenName: "", notes: "", ...extra });

test("пустая книга: честная строка, а не пустота", () => {
  assert.match(buildTreeContext([], []), /пустая/);
});

test("связи пишутся номерами и именами, есть дети и супруги", () => {
  const people = [P("a", "Анна", { birthYear: "1942", maidenName: "Петрова", spouse: "b" }), P("b", "Иван", { spouse: "a" }), P("c", "Мария", { parents: ["a", "b"], relation: "мама" })];
  const text = buildTreeContext(people);
  assert.match(text, /Анна/);
  assert.match(text, /родился\(ась\): 1942/);
  assert.match(text, /девичья фамилия: Петрова/);
  assert.match(text, /дети: Мария/);
  assert.match(text, /родители: Анна \(№\d\), Иван \(№\d\)/);
});

test("большая книга не превышает лимит, связанные люди идут первыми", () => {
  const people: Person[] = [];
  for (let i = 0; i < 600; i += 1) people.push(P(`p${i}`, `Человек ${i}`, { notes: "длинная заметка ".repeat(30), parents: i > 0 && i < 5 ? ["p0"] : undefined }));
  const text = buildTreeContext(people);
  assert.ok(text.length <= CONTEXT_LIMIT);
  assert.match(text, /Человек 0/);
  assert.match(text, /в контекст не поместились/);
});

test("спецсимволы и переносы в заметках не ломают строку", () => {
  const text = buildTreeContext([P("a", "Анна\u0000", { notes: "строка1\nстрока2\t\u001b[31mкрасный" })]);
  // eslint-disable-next-line no-control-regex
  assert.ok(!/[\u0000-\u0008\u000b-\u001f]/.test(text));
  assert.match(text, /строка1 строка2/);
});

test("фото и ссылки на файлы не попадают в контекст", () => {
  const text = buildTreeContext([P("a", "Анна", { photo: "media:abcdef12-3456", gedSource: "secret.ged", gedId: "@I1@" })]);
  assert.ok(!text.includes("media:") && !text.includes("secret.ged") && !text.includes("@I1@"));
});

test("места добавляются, пока есть место", () => {
  const places: Place[] = [{ id: "1", name: "Смоленск", years: "1950", note: "деревня", peopleIds: ["a"] }];
  assert.match(buildTreeContext([P("a", "Анна")], places), /Места:\nСмоленск \(1950\); связаны: Анна/);
});
