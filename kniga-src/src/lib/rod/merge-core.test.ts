/** С-3б: тесты общего ядра слияния merge-core. Ядро ни к чему в приложении не подключено. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { copyOf, decide, fingerprint, mergeBook, mergeList, mergeRecord, stableStringify, valueEqual, type Rec } from "./merge-core.ts";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const P = (o: Record<string, unknown> = {}): Rec => ({ id: "p", name: "Анна", birthYear: "1950", ...o });
const m = (b: Rec | undefined, o: Rec | undefined, t: Rec | undefined) => mergeRecord("p", b, o, t);

// ——— чистота и сравнение
test("00 ядро чистое: ничего не импортирует (ни браузер, ни сеть, ни другие модули приложения)", () => {
  const src = readFileSync(new URL("./merge-core.ts", import.meta.url), "utf8");
  assert.equal(/^\s*import\s/m.test(src), false);
  assert.equal(/\b(fetch|localStorage|document|window|XMLHttpRequest)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), false);
});
test("01 сравнение не зависит от порядка ключей на любой глубине", () => {
  assert.equal(valueEqual({ a: 1, b: { c: [1, { x: 1, y: 2 }], d: 2 } }, { b: { d: 2, c: [1, { y: 2, x: 1 }] }, a: 1 }), true);
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }));
});
test("02 порядок элементов массива важен; null, пусто и «поля нет» различаются", () => {
  assert.equal(valueEqual([1, 2], [2, 1]), false);
  assert.equal(valueEqual(null, undefined), false);
  assert.equal(valueEqual("", undefined), false);
  assert.equal(valueEqual({ a: undefined }, {}), true); // ключ со значением undefined то же, что нет ключа, как в JSON
});

// ——— добавление
test("10 их добавление, у нас нет: take, запись попадает целиком с тем же id", () => {
  const r = m(undefined, undefined, P());
  assert.equal(r.status, "take");
  assert.deepEqual(r.merged, P());
});
test("11 наше добавление, у них нет: ничего", () => assert.equal(m(undefined, P(), undefined).status, "same"));
test("12 оба добавили одинаковую запись: ничего (в том числе при другом порядке ключей)", () => {
  assert.equal(m(undefined, P(), P()).status, "same");
  assert.equal(m(undefined, P(), { birthYear: "1950", name: "Анна", id: "p" }).status, "same");
});
test("13 одинаковый id у разных записей: конфликт add-add, записи не смешиваются, у нас остаётся своя", () => {
  const r = m(undefined, P({ name: "Анна С." }), P({ name: "Анна И.", notes: "н" }));
  assert.equal(r.status, "conflict");
  assert.equal(r.kind, "add-add");
  assert.deepEqual(r.merged, P({ name: "Анна С." }));
  assert.deepEqual(r.theirs, P({ name: "Анна И.", notes: "н" }));
  assert.deepEqual(r.fields.map((f) => f.field).sort(), ["name", "notes"]);
});

// ——— изменение по полям
test("20 менял только он: take", () => {
  const r = m(P(), P(), P({ birthYear: "1951" }));
  assert.equal(r.status, "take");
  assert.equal(r.merged?.birthYear, "1951");
});
test("21 менял только мы: ничего (наше остаётся)", () => {
  const r = m(P(), P({ birthYear: "1951" }), P());
  assert.equal(r.status, "same");
  assert.equal(r.merged?.birthYear, "1951");
});
test("22 разные поля: оба изменения вместе, без конфликта", () => {
  const r = m(P(), P({ notes: "наша" }), P({ birthYear: "1951" }));
  assert.equal(r.status, "take");
  assert.deepEqual(r.merged, P({ notes: "наша", birthYear: "1951" }));
});
test("23 то же поле по-разному: конфликт поля, только спорное поле, у нас остаётся наше, обе версии и base сохранены", () => {
  const r = m(P(), P({ name: "Анна С.", notes: "н" }), P({ name: "Анна И.", birthYear: "1951" }));
  assert.equal(r.status, "conflict");
  assert.equal(r.kind, "fields");
  assert.deepEqual(r.fields, [{ field: "name", base: "Анна", ours: "Анна С.", theirs: "Анна И." }]);
  assert.equal(r.merged?.name, "Анна С.");
  assert.equal(r.merged?.birthYear, "1951"); // неспорное чистое изменение применено
  assert.equal(r.theirs?.name, "Анна И.");
});
test("24 одинаковое изменение с обеих сторон: не конфликт", () => {
  const r = m(P(), P({ name: "Анна И." }), P({ name: "Анна И.", birthYear: "1951" }));
  assert.equal(r.status, "take");
  assert.equal(r.merged?.name, "Анна И.");
});
test("25 поле убрано им, нами не менялось: поле убирается; убрано нами, им не менялось: остаётся убрано", () => {
  const withNotes = P({ notes: "x" });
  const a = m(withNotes, withNotes, P());
  assert.equal(a.status, "take");
  assert.equal("notes" in (a.merged as Rec), false);
  const b = m(withNotes, P(), withNotes);
  assert.equal(b.status, "same");
  assert.equal("notes" in (b.merged as Rec), false);
});
test("26 поле убрано одним, изменено другим: конфликт поля с обеими версиями (убрано = undefined)", () => {
  const r = m(P({ notes: "x" }), P({ notes: "y" }), P());
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.fields, [{ field: "notes", base: "x", ours: "y", theirs: undefined }]);
  assert.equal(r.merged?.notes, "y");
});
test("27 оба добавили одно новое поле: одинаково — ок, по-разному — конфликт", () => {
  assert.equal(m(P(), P({ n: 1 }), P({ n: 1 })).status, "same");
  assert.equal(m(P(), P({ n: 1 }), P({ n: 2 })).status, "conflict");
});

// ——— вложенные значения и списки целиком
test("30 список (parents) меняли с двух сторон: конфликт всего поля, массивы не смешиваются", () => {
  const r = m(P({ parents: ["a"] }), P({ parents: ["a", "b"] }), P({ parents: ["a", "c"] }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.merged?.parents, ["a", "b"]);
  assert.deepEqual(r.fields[0].theirs, ["a", "c"]);
});
test("31 список менял один: берётся целиком", () => {
  const r = m(P({ parents: ["a"] }), P({ parents: ["a"] }), P({ parents: ["a", "c"] }));
  assert.deepEqual(r.merged?.parents, ["a", "c"]);
});
test("32 вложенный объект: разный порядок ключей не конфликт (С-3а, расхождение 4)", () => {
  const base = P({ geo: { lat: 1, lng: 2 } });
  const r = m(base, P({ geo: { lng: 2, lat: 1 } }), P({ geo: { lat: 5, lng: 2 } }));
  assert.equal(r.status, "take");
  assert.deepEqual(r.merged?.geo, { lat: 5, lng: 2 });
});
test("33 вложенный объект менялся внутри с обеих сторон разными ключами: всё равно конфликт верхнего поля, части не смешиваются", () => {
  const base = P({ geo: { lat: 1, lng: 2 } });
  const r = m(base, P({ geo: { lat: 9, lng: 2 } }), P({ geo: { lat: 1, lng: 7 } }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.merged?.geo, { lat: 9, lng: 2 });
});

// ——— неизвестные поля, id, фото, родственные связи
test("40 неизвестные поля обеих сторон сохраняются в результате", () => {
  const r = m(P(), P({ futureOurs: { a: [1] } }), P({ birthYear: "1951", futureTheirs: "я" }));
  assert.deepEqual(r.merged?.futureOurs, { a: [1] });
  assert.equal(r.merged?.futureTheirs, "я");
});
test("41 неизвестное поле, спорное с двух сторон, даёт конфликт, а не потерю", () => {
  const r = m(P({ f: 1 }), P({ f: 2 }), P({ f: 3 }));
  assert.equal(r.status, "conflict");
  assert.deepEqual(r.fields.map((c) => [c.ours, c.theirs]), [[2, 3]]);
});
test("42 родственные связи, усыновление и фото (поля parents, adoptedBy, photos) не теряются при чистом слиянии", () => {
  const base = P({ parents: ["a"], adoptedBy: [], photos: ["f1"], spouse: "s" });
  const r = m(base, P({ ...base, photos: ["f1", "f2"] }), P({ ...base, adoptedBy: ["z"] }));
  assert.equal(r.status, "take");
  assert.deepEqual(r.merged, P({ parents: ["a"], adoptedBy: ["z"], photos: ["f1", "f2"], spouse: "s" }));
});
test("43 id записи не меняется и не участвует в слиянии", () => {
  const r = m(P(), P(), P({ id: "p", birthYear: "1951" }));
  assert.equal(r.merged?.id, "p");
  assert.equal(r.id, "p");
});
test("44 входные записи не изменяются", () => {
  const b = P(), o = P({ notes: "н" }), t = P({ name: "Анна И.", notes: "т" });
  const copies = [clone(b), clone(o), clone(t)];
  const r = m(b, o, t);
  r.merged!.name = "испорчено";
  r.ours!.name = "испорчено";
  assert.deepEqual([b, o, t], copies);
});

// ——— удаление против правки (С-3а, расхождение 1)
test("50 они убрали, мы не менялись: remove, запись у нас не тронута до подтверждения", () => {
  const r = m(P(), P(), undefined);
  assert.equal(r.status, "remove");
  assert.deepEqual(r.merged, P());
});
test("51 они убрали, а мы правили: конфликт delete-edit, запись остаётся, обе версии хранятся", () => {
  const r = m(P(), P({ name: "Анна С." }), undefined);
  assert.equal(r.status, "conflict");
  assert.equal(r.kind, "delete-edit");
  assert.equal(r.merged?.name, "Анна С.");
  assert.equal(r.theirs, undefined);
  assert.equal(r.ours?.name, "Анна С.");
});
test("52 мы убрали, а они правили: конфликт edit-after-delete, запись НЕ воскрешается, правка целиком в theirs", () => {
  const r = m(P(), undefined, P({ birthYear: "1951" }));
  assert.equal(r.status, "conflict");
  assert.equal(r.kind, "edit-after-delete");
  assert.equal(r.merged, undefined);
  assert.deepEqual(r.theirs, P({ birthYear: "1951" }));
  assert.deepEqual(mergeList([P()], [], [P({ birthYear: "1951" })]).merged, []); // в списке тоже не воскрешена
});
test("53 мы убрали, они не менялись или тоже убрали: ничего", () => {
  assert.equal(m(P(), undefined, P()).status, "same");
  assert.equal(m(P(), undefined, undefined).status, "same");
});
test("54 удаление в конфликтных случаях никогда не применяется автоматически в списке", () => {
  const list = mergeList([P()], [P({ name: "Анна С." })], []);
  assert.deepEqual(list.merged, [P({ name: "Анна С." })]);
  assert.equal(list.conflicts.length, 1);
  const rem = mergeList([P()], [P()], []);
  assert.deepEqual(rem.merged, [P()]); // чистое удаление тоже только предложение
  assert.equal(rem.removals.length, 1);
});

// ——— статусы соответствуют фактическому результату слияния (С-3а, расхождение 2 и 3)
test("60 владелец принял правку и дописал другое поле: слияние видит правку уже внутри, статус «same» (принято), а не «не принято»", () => {
  const sent = P({ birthYear: "1951" });
  const owner = P({ birthYear: "1951", notes: "дописал" });
  assert.equal(m(P(), owner, sent).status, "same");
});
test("61 владелец принял правку, но другой порядок ключей: «same»", () => {
  const owner: Rec = { birthYear: "1951", name: "Анна", id: "p" };
  assert.equal(m(P(), owner, P({ birthYear: "1951" })).status, "same");
});

// ——— списки записей
test("70 список: порядок ours сохранён, новые от theirs в конце, удаления и конфликты не применены", () => {
  const a = (id: string, o: Record<string, unknown> = {}): Rec => ({ id, name: id, ...o });
  const base = [a("a"), a("b"), a("c")];
  const ours = [a("c"), a("a", { name: "A!" }), a("b")];
  const theirs = [a("a"), a("b", { name: "B!" }), a("c"), a("d")];
  const r = mergeList(base, ours, theirs);
  assert.deepEqual(r.merged.map((x) => x.id), ["c", "a", "b", "d"]);
  assert.equal(r.merged.find((x) => x.id === "b")?.name, "B!");
  assert.equal(r.merged.find((x) => x.id === "a")?.name, "A!");
});
test("71 книга: слияние по ключам, отсутствующие списки считаются пустыми", () => {
  const r = mergeBook({}, { people: [P()] }, { places: [{ id: "x", name: "Тула" }] }, ["people", "places", "photos"]);
  assert.equal(r.people.merged.length, 1);
  assert.equal(r.places.merged[0].id, "x");
  assert.deepEqual(r.photos.merged, []);
});

// ——— решения и ID: шесть проверок из отчёта
const conflictAddAdd = () => m(undefined, P({ name: "Анна С." }), P({ name: "Анна И." }));
test("80 «Обе копией»: исходная запись сохраняет прежний id и содержимое", () => {
  const r = conflictAddAdd();
  const out = decide([r.ours!], r, "copy");
  assert.equal(out.find((x) => x.id === "p")?.name, "Анна С.");
});
test("81 «Обе копией»: копия получает новый id (не совпадает с исходным), содержимое версии theirs; настоящее имя НЕ меняется, пометка отдельными полями", () => {
  const r = conflictAddAdd();
  const out = decide([r.ours!], r, "copy");
  assert.equal(out.length, 2);
  const copy = out.find((x) => x.id !== "p")!;
  assert.match(copy.id, /^p-c[0-9a-z]+$/);
  assert.equal(copy.name, "Анна И."); // настоящее поле имени чужой версии как есть
  assert.equal(copy.copyOf, "p");
  assert.equal(copy.copyLabel, "от помощника");
  assert.equal(r.theirs!.name, "Анна И."); // входная версия не изменена
  assert.equal("copyOf" in r.theirs!, false);
});
test("82 «Обе копией»: повторное применение того же решения не создаёт ещё одну копию", () => {
  const r = conflictAddAdd();
  const once = decide([r.ours!], r, "copy");
  const twice = decide(once, r, "copy");
  const thrice = decide(twice, r, "copy");
  assert.equal(thrice.length, 2);
  assert.deepEqual(thrice, once);
  assert.equal(copyOf(r.theirs!).id, copyOf(clone(r.theirs!)).id); // id устойчив: зависит только от содержимого
});
test("83 «Взять помощника» при конфликте добавления не теряет и не меняет id: запись заменена, id тот же, второй записи нет", () => {
  const r = conflictAddAdd();
  const out = decide([r.ours!], r, "theirs");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "p");
  assert.equal(out[0].name, "Анна И.");
});
test("84 remove: после подтверждения («theirs») запись штатно удаляется, у остальных id не меняются", () => {
  const other: Rec = { id: "q", name: "Борис" };
  const r = m(P(), P(), undefined);
  const out = decide([P(), other], r, "theirs");
  assert.deepEqual(out, [other]);
  assert.deepEqual(decide([P(), other], r, "ours"), [P(), other]); // «оставить» ничего не удаляет
});
test("85 edit-after-delete: если владелец сам решил восстановить («theirs»), запись возвращается с прежним id; автоматически нет", () => {
  const r = m(P(), undefined, P({ birthYear: "1951" }));
  assert.deepEqual(mergeList([P()], [], [P({ birthYear: "1951" })]).merged, []);
  const out = decide([], r, "theirs");
  assert.deepEqual(out, [P({ birthYear: "1951" })]);
  assert.equal(out[0].id, "p");
});
test("86 delete-edit: «ours» сохраняет запись, «theirs» удаляет только по решению, «copy» без версии theirs ничего не создаёт", () => {
  const r = m(P(), P({ name: "Анна С." }), undefined);
  assert.equal(decide([r.ours!], r, "ours").length, 1);
  assert.deepEqual(decide([r.ours!], r, "theirs"), []);
  assert.deepEqual(decide([r.ours!], r, "copy"), [r.ours]);
});
test("87 конфликт полей: «theirs» берёт спорные поля их, остальное остаётся; «ours» оставляет наше в спорном, но чистое от них не теряется; «copy» добавляет копию их версии", () => {
  const r = m(P(), P({ name: "Анна С.", notes: "н" }), P({ name: "Анна И.", birthYear: "1951" }));
  const t = decide([r.ours!], r, "theirs")[0];
  assert.deepEqual([t.name, t.birthYear, t.notes, t.id], ["Анна И.", "1951", "н", "p"]);
  const o = decide([r.ours!], r, "ours")[0];
  assert.deepEqual([o.name, o.birthYear, o.notes, o.id], ["Анна С.", "1951", "н", "p"]);
  const c = decide([r.ours!], r, "copy");
  assert.equal(c.length, 2);
  assert.equal(c[0].name, "Анна С.");
});

// ——— С-3б, уточнения: не терять непротиворечивые изменения ни одной стороны
const abBase = (): Rec => P({ notes: "", place: "" });
const abOurs = (): Rec => P({ notes: "наша заметка", name: "Анна С.", place: "" }); // у владельца: А (notes) и спорное Б (name)
const abTheirs = (): Rec => P({ notes: "", name: "Анна И.", place: "Тула" }); // у помощника: спорное Б (name) и чистое В (place)
test("88 пример: владелец менял А и Б, помощник Б и В. «Взять помощника»: А владельца сохранено, Б от помощника, В от помощника", () => {
  const r = m(abBase(), abOurs(), abTheirs());
  assert.deepEqual(r.fields.map((f) => f.field), ["name"]);
  const t = decide([abOurs()], r, "theirs")[0];
  assert.deepEqual([t.notes, t.name, t.place], ["наша заметка", "Анна И.", "Тула"]);
});
test("89 тот же пример, «Оставить моё»: А и Б владельца сохранены, чистое В помощника НЕ теряется", () => {
  const r = m(abBase(), abOurs(), abTheirs());
  const o = decide([abOurs()], r, "ours")[0];
  assert.deepEqual([o.notes, o.name, o.place], ["наша заметка", "Анна С.", "Тула"]);
});
test("89б в предложении списка запись с конфликтом тоже содержит чистое от помощника", () => {
  const r = mergeList([abBase()], [abOurs()], [abTheirs()]);
  assert.equal(r.merged[0].place, "Тула");
  assert.equal(r.merged[0].name, "Анна С."); // спорное остаётся нашим
  assert.equal(r.conflicts.length, 1);
});
test("89в поле, которое владелец успел изменить уже ПОСЛЕ слияния, решение не затирает (ни «theirs», ни «ours»)", () => {
  const r = m(abBase(), abOurs(), abTheirs());
  const later = P({ notes: "дописал позже", name: "Анна С.", place: "Омск" });
  for (const d of ["theirs", "ours"] as const) {
    const out = decide([later], r, d)[0];
    assert.equal(out.notes, "дописал позже", d);
    assert.equal(out.place, "Омск", d); // чистое поле тоже менялось у нас после слияния: не перезаписано
  }
  assert.equal(decide([later], r, "theirs")[0].name, "Анна И."); // спорное по решению «theirs»
});
test("89г повторное применение «theirs» и «ours» к полям даёт тот же результат", () => {
  const r = m(abBase(), abOurs(), abTheirs());
  for (const d of ["theirs", "ours"] as const) {
    const once = decide([abOurs()], r, d);
    assert.deepEqual(decide(once, r, d), once);
  }
});

// ——— С-3б, уточнения: безопасный id копии
test("96 id копии занят ДРУГОЙ записью: копия не перезаписывает её и не теряется, получает следующий id", () => {
  const r = conflictAddAdd();
  const taken = copyOf(r.theirs!).id;
  const other: Rec = { id: taken, name: "Совсем другая запись" };
  const out = decide([r.ours!, other], r, "copy");
  assert.equal(out.length, 3);
  assert.deepEqual(out.find((x) => x.id === taken), other); // чужая запись не тронута
  const placed = out.find((x) => x.id === `${taken}-2`)!;
  assert.equal(placed.name, "Анна И.");
  assert.equal(placed.copyOf, "p");
});
test("97 при коллизии повторное применение тоже идемпотентно (ровно одна копия, на -2)", () => {
  const r = conflictAddAdd();
  const taken = copyOf(r.theirs!).id;
  const start: Rec[] = [r.ours!, { id: taken, name: "Другая" }];
  const once = decide(start, r, "copy");
  const twice = decide(once, r, "copy");
  const thrice = decide(twice, r, "copy");
  assert.equal(thrice.length, 3);
  assert.deepEqual(thrice, once);
});
test("98 несколько подряд занятых id: копия берёт первый свободный, все чужие записи целы", () => {
  const r = conflictAddAdd();
  const id = copyOf(r.theirs!).id;
  const others: Rec[] = [{ id, name: "1" }, { id: `${id}-2`, name: "2" }, { id: `${id}-3`, name: "3" }];
  const out = decide([r.ours!, ...others], r, "copy");
  assert.equal(out.length, 5);
  assert.deepEqual(out.slice(0, 4), [r.ours, ...others.slice(0, 3)].map(clone).slice(0, 4));
  assert.equal(out[4].id, `${id}-4`);
});
test("99 уже лежит ровно эта копия под основным id: ничего не добавляется", () => {
  const r = conflictAddAdd();
  const once = decide([r.ours!], r, "copy");
  assert.equal(decide(once, r, "copy").length, 2);
});
test("99б копия никогда не перезаписывает исходную запись и не меняет её id", () => {
  const r = conflictAddAdd();
  const out = decide([r.ours!], r, "copy");
  assert.deepEqual(out.find((x) => x.id === "p"), r.ours);
});
test("99в отпечаток 64-битный (два хэша), стабилен и различает близкие записи", () => {
  assert.ok(fingerprint({ a: 1 }).length >= 10);
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
  assert.equal(fingerprint({ b: 1, a: 2 }), fingerprint({ a: 2, b: 1 }));
});

// ——— идемпотентность и порядок
test("90 повторное слияние той же правки в уже слитую книгу даёт тот же результат и те же конфликты", () => {
  const base = [P(), { id: "q", name: "Борис" }];
  const ours = [P({ notes: "н" }), { id: "q", name: "Борис С." }];
  const theirs = [P({ birthYear: "1951" }), { id: "q", name: "Борис И." }, { id: "r", name: "Вера" }];
  const first = mergeList(base, ours, theirs);
  const second = mergeList(base, first.merged, theirs);
  assert.equal(stableStringify(second.merged), stableStringify(first.merged));
  assert.equal(stableStringify(second.conflicts.map((c) => [c.id, c.kind, c.fields])), stableStringify(first.conflicts.map((c) => [c.id, c.kind, c.fields])));
});
test("91 неконфликтные правки двух помощников не зависят от порядка применения", () => {
  const base = [P(), { id: "q", name: "Борис" }];
  const h1 = [P({ birthYear: "1951" }), { id: "q", name: "Борис" }, { id: "r", name: "Вера" }];
  const h2 = [P({ notes: "н" }), { id: "q", name: "Борис Н." }];
  const a = mergeList(base, mergeList(base, base, h1).merged, h2).merged;
  const b = mergeList(base, mergeList(base, base, h2).merged, h1).merged;
  const norm = (l: Rec[]) => stableStringify([...l].sort((x, y) => x.id.localeCompare(y.id)));
  assert.equal(norm(a), norm(b));
  assert.equal(a.length, 3);
});
test("92 два помощника правят одно поле: первый применён, второй даёт конфликт с обеими версиями, ничего не теряется", () => {
  const base = [P()];
  const h1 = [P({ name: "Анна 1" })];
  const h2 = [P({ name: "Анна 2" })];
  const after1 = mergeList(base, base, h1).merged;
  const second = mergeList(base, after1, h2);
  assert.equal(second.conflicts.length, 1);
  assert.deepEqual(second.conflicts[0].fields, [{ field: "name", base: "Анна", ours: "Анна 1", theirs: "Анна 2" }]);
  assert.equal(second.merged[0].name, "Анна 1");
});
test("93 один помощник убрал, другой правил: запись остаётся, конфликт хранит обе версии", () => {
  const base = [P()];
  const afterDelete = mergeList(base, base, []);
  assert.equal(afterDelete.removals.length, 1); // предложение, не применено
  const second = mergeList(base, base, [P({ name: "Анна 2" })]);
  const merged = mergeList(base, second.merged, []); // удаление приходит после принятой правки
  assert.equal(merged.conflicts[0].kind, "delete-edit");
  assert.equal(merged.merged[0].name, "Анна 2");
});
test("94 случайные книги: ни одно значение не пропадает (оно либо в результате, либо в конфликте)", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  for (let n = 0; n < 200; n += 1) {
    const mk = (): Rec => ({ id: "p", a: pick(["x", "y", "z"]), b: pick([1, 2, 3]), c: pick([[1], [2], [1, 2]]), ...(rnd() < 0.5 ? { u: pick(["u1", "u2"]) } : {}) });
    const base = mk();
    const edit = (rec: Rec): Rec => ({ ...rec, ...(rnd() < 0.5 ? { a: pick(["x", "y", "z"]) } : {}), ...(rnd() < 0.5 ? { b: pick([1, 2, 3]) } : {}) });
    const ours = edit(base), theirs = edit(base);
    const r = m(base, ours, theirs);
    for (const f of ["a", "b", "c", "u"]) {
      const t = theirs[f], o = ours[f];
      const inResult = valueEqual(r.merged?.[f], t) || valueEqual(r.merged?.[f], o);
      assert.ok(inResult || r.fields.some((c) => c.field === f), `поле ${f} потеряно, seed ${n}`);
      const conflict = r.fields.find((c) => c.field === f);
      if (conflict) assert.ok(valueEqual(conflict.ours, o) && valueEqual(conflict.theirs, t));
    }
    const again = m(base, r.merged, theirs); // идемпотентность
    assert.equal(stableStringify(again.merged), stableStringify(r.merged));
  }
});
test("95 отпечаток стабилен и зависит только от содержимого", () => {
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }));
});
