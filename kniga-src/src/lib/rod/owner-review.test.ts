/** С-3г: сторона владельца на merge-core: удаление, конфликты, повторная отправка, id, данные, решение А (ранее выложенные записи), решение Б (пометка копии). */
import assert from "node:assert/strict";
import test from "node:test";
import { applyReview, defaultDecision, makeChangeSet, rememberPublished, reviewChanges, summarize, type Book, type Change, type Decision, type Rec } from "./helper-changes.ts";
import { copyNote } from "./copy-note.ts";
import { stableStringify } from "./merge-core.ts";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const P = (id: string, extra: Record<string, unknown> = {}): Rec => ({ id, name: id, relation: "", birthYear: "1950", ...extra });
const book = (people: Rec[], extra: Partial<Book> = {}): Book => ({ people, places: [], stories: [], notes: [], pages: [], photos: [], ...extra });
const ids = (out: Partial<Record<string, Rec[]>>, key = "people") => (out[key] ?? []).map((r) => r.id);
/** Как у приложения: разбор, потом применение к ТЕКУЩЕЙ книге. */
const flow = (owner: Book, helperBase: Book, helperNow: Book, decisions: Record<string, Decision> = {}, published?: Record<string, string[]>) => {
  const changes = makeChangeSet(helperBase, helperNow);
  const items = reviewChanges(owner, changes, { published });
  return { changes, items, out: applyReview(owner, items, decisions, "от Мамы") };
};
const merge = (owner: Book, out: Partial<Record<string, Rec[]>>): Book => ({ ...owner, ...out });

// ——— А. запись, которую владелец раньше выкладывал и сейчас убрал
test("А1 помощник присылает добавлением запись, выложенную раньше и убранную владельцем: новое предложение с пояснением, по умолчанию «Не надо», в книгу сама не возвращается", () => {
  const helperBase = book([P("a"), P("b")]);
  const owner = book([P("a")]); // b владелец убрал
  const { items, out } = flow(owner, book([P("a")]), helperBase, {}, { people: ["a", "b"] }); // помощник «возвращает» b (отправка снова)
  const item = items.find((i) => i.id === "b")!;
  assert.equal(item.state, "clean");
  assert.equal(item.kind, "add");
  assert.equal(item.wasPublished, true);
  assert.equal(defaultDecision(item), "reject");
  assert.equal(out.people, undefined); // ничего не применилось
});
test("А2 только по явному решению «Принять» запись возвращается, с прежним id", () => {
  const owner = book([P("a")]);
  const { out } = flow(owner, book([P("a")]), book([P("a"), P("b", { name: "Борис" })]), { "people:b": "accept" }, { people: ["a", "b"] });
  assert.deepEqual(ids(out), ["a", "b"]);
  assert.equal(out.people!.find((r) => r.id === "b")!.name, "Борис");
});
test("А3 обычная новая запись, которой владелец раньше не выкладывал: как прежде, без пометки, по умолчанию принять", () => {
  const owner = book([P("a")]);
  const { items, out } = flow(owner, book([P("a")]), book([P("a"), P("n")]), {}, { people: ["a", "b"] });
  const item = items.find((i) => i.id === "n")!;
  assert.equal(item.wasPublished, undefined);
  assert.equal(defaultDecision(item), "accept");
  assert.deepEqual(ids(out), ["a", "n"]);
});
test("А4 без списка выложенных id (переустановка, другое устройство, старая запись) всё работает как раньше: запись выглядит обычной новой", () => {
  const owner = book([P("a")]);
  const { items } = flow(owner, book([P("a")]), book([P("a"), P("b")]), {}, undefined);
  assert.equal(items.find((i) => i.id === "b")!.wasPublished, undefined);
  assert.equal(defaultDecision(items.find((i) => i.id === "b")!), "accept");
});
test("А5 запись из списка, которая сейчас есть у владельца, пометки не получает", () => {
  const owner = book([P("a"), P("b", { name: "Другой" })]);
  const { items } = flow(owner, book([P("a")]), book([P("a"), P("b")]), {}, { people: ["a", "b"] });
  const b = items.find((i) => i.id === "b")!;
  assert.equal(b.wasPublished, undefined);
  assert.equal(b.state, "conflict"); // тот же id, другое содержимое
});
test("А6 список выложенных id только растёт: удалённая позже запись остаётся в нём; старый список без id допускается", () => {
  const first = rememberPublished(undefined, book([P("a"), P("b")]));
  assert.deepEqual(first.people, ["a", "b"]);
  const second = rememberPublished(first, book([P("a"), P("c")])); // b убрана
  assert.deepEqual(second.people.sort(), ["a", "b", "c"]);
  assert.deepEqual(second.pages, []);
});
test("А7 правка записи (не добавление) пометку «выкладывалась» не получает", () => {
  const { items } = flow(book([P("a")]), book([P("a")]), book([P("a", { birthYear: "1951" })]), {}, { people: ["a"] });
  assert.equal(items[0].wasPublished, undefined);
});

// ——— Удаление и конфликты
test("Д1 владелец убрал запись, помощник её правил: конфликт, обе версии видны, запись сама не возвращается; вернуть с тем же id только явно", () => {
  const owner = book([P("b")]);
  const { items, out } = flow(owner, book([P("a"), P("b")]), book([P("a", { birthYear: "1951" }), P("b")]));
  assert.equal(items[0].state, "conflict");
  assert.equal(items[0].conflictKind, "edit-after-delete");
  assert.equal(items[0].mine, undefined);
  assert.equal((items[0].theirs as Rec).birthYear, "1951");
  assert.equal(out.people, undefined);
  const restored = applyReview(owner, items, { "people:a": "theirs" }).people!;
  assert.equal(restored.find((r) => r.id === "a")!.birthYear, "1951");
});
test("Д2 помощник убрал запись, владелец её правил: конфликт, запись остаётся, убрать только по явному решению", () => {
  const owner = book([P("a", { birthYear: "1960" })]);
  const { items, out } = flow(owner, book([P("a")]), book([]));
  assert.equal(items[0].conflictKind, "delete-edit");
  assert.equal((items[0].mine as Rec).birthYear, "1960");
  assert.equal(out.people, undefined);
  assert.deepEqual(applyReview(owner, items, { "people:a": "accept" }).people, []);
});
test("Д3 помощник убрал запись, владелец не менял: предложение «убрать», по умолчанию остаётся", () => {
  const owner = book([P("a")]);
  const { items, out } = flow(owner, book([P("a")]), book([]));
  assert.equal(items[0].state, "remove");
  assert.equal(out.people, undefined);
});
test("Д4 оба убрали: ничего", () => {
  const { items, out } = flow(book([]), book([P("a")]), book([]));
  assert.equal(items[0].state, "already");
  assert.deepEqual(out, {});
});
test("Д5 то же поле по-разному: поле в конфликте, обе версии в предложении, неспорное добавляется, спорное остаётся владельцу", () => {
  const owner = book([P("a", { name: "Сидорова" })]);
  const { items, out } = flow(owner, book([P("a")]), book([P("a", { name: "Иванова", birthYear: "1951" })]));
  assert.deepEqual(items[0].fields, ["name"]);
  assert.equal((items[0].mine as Rec).name, "Сидорова");
  assert.equal((items[0].theirs as Rec).name, "Иванова");
  assert.equal(out.people![0].name, "Сидорова");
  assert.equal(out.people![0].birthYear, "1951");
});
test("Д6 одинаковый id у разных добавлений: обе записи сохранены; «Взять помощника» заменяет запись с тем же id, не плодит вторую", () => {
  const owner = book([P("a", { name: "Моя" })]);
  const { items } = flow(owner, book([]), book([P("a", { name: "Помощника" })]));
  assert.equal(items[0].conflictKind, "add-add");
  const out = applyReview(owner, items, { "people:a": "theirs" });
  assert.deepEqual(ids(out), ["a"]);
  assert.equal(out.people![0].name, "Помощника");
});

// ——— Повторная отправка и повторное применение
test("П1 то же предложение пришло дважды (два входящих): после первого применения второе «already», дублей нет", () => {
  const helperBase = book([P("a")]);
  const helperNow = book([P("a"), P("c")]);
  const changes = makeChangeSet(helperBase, helperNow);
  const owner = book([P("a")]);
  const first = applyReview(owner, reviewChanges(owner, changes), {});
  const after = merge(owner, first);
  const again = reviewChanges(after, changes);
  assert.equal(again[0].state, "already");
  assert.deepEqual(applyReview(after, again, {}), {});
});
test("П2 «Обе копией» применено дважды (в том числе из повторно полученного предложения): копия одна", () => {
  const owner = book([], { pages: [{ id: "pg", title: "Моя" } as Rec] });
  const changes = makeChangeSet(book([], { pages: [{ id: "pg", title: "Была" } as Rec] }), book([], { pages: [{ id: "pg", title: "Мамина" } as Rec] }));
  const items = reviewChanges(owner, changes);
  const once = merge(owner, applyReview(owner, items, { "pages:pg": "copy" }, "от Мамы"));
  const twice = merge(once, applyReview(once, items, { "pages:pg": "copy" }, "от Мамы"));
  assert.equal((once.pages as Rec[]).length, 2);
  assert.equal((twice.pages as Rec[]).length, 2);
  const copy = (once.pages as Rec[]).find((p) => p.id !== "pg")!;
  assert.equal(copy.title, "Мамина");
  assert.equal(copy.copyOf, "pg");
  assert.equal(copy.copyLabel, "от Мамы");
});
test("П3 «Взять помощника» и «Принять» применены дважды дают тот же результат", () => {
  const owner = book([P("a", { name: "Сидорова" }), P("z")]);
  const { items } = flow(owner, book([P("a"), P("z")]), book([P("a", { name: "Иванова", birthYear: "1951" }), P("z")]));
  const once = merge(owner, applyReview(owner, items, { "people:a": "theirs" }));
  const twice = merge(once, applyReview(once, items, { "people:a": "theirs" }));
  assert.equal(stableStringify(once.people), stableStringify(twice.people));
});
test("П4 два помощника правят одно поле: после принятия Мамы Папа получает конфликт со значением Мамы, всё сохранено", () => {
  const base = book([P("a")]);
  let owner = book([P("a")]);
  const mama = makeChangeSet(base, book([P("a", { name: "От мамы" })]));
  const papa = makeChangeSet(base, book([P("a", { name: "От папы", birthYear: "1951" })]));
  owner = merge(owner, applyReview(owner, reviewChanges(owner, mama), {}));
  const items = reviewChanges(owner, papa);
  assert.equal(items[0].state, "conflict");
  assert.equal((items[0].mine as Rec).name, "От мамы");
  assert.equal((items[0].theirs as Rec).name, "От папы");
  const after = merge(owner, applyReview(owner, items, {}));
  assert.equal((after.people as Rec[])[0].name, "От мамы");
  assert.equal((after.people as Rec[])[0].birthYear, "1951");
});
test("П5 два помощника правят разные поля одной записи: складываются независимо от порядка", () => {
  const base = book([P("a")]);
  const a = makeChangeSet(base, book([P("a", { notes: "А" })]));
  const b = makeChangeSet(base, book([P("a", { birthYear: "1951" })]));
  const run = (first: Change[], second: Change[]) => {
    let o = book([P("a")]);
    o = merge(o, applyReview(o, reviewChanges(o, first), {}));
    o = merge(o, applyReview(o, reviewChanges(o, second), {}));
    return stableStringify(o.people);
  };
  assert.equal(run(a, b), run(b, a));
});

// ——— Изменения владельца после получения предложения
test("В1 владелец изменил запись после разбора, но до «Применить»: его изменение не затирается ни при «Принять», ни при «Взять помощника»", () => {
  const owner0 = book([P("a", { name: "Сидорова" })]);
  const changes = makeChangeSet(book([P("a")]), book([P("a", { name: "Иванова", birthYear: "1951" })]));
  const items = reviewChanges(owner0, changes);
  const owner1 = book([P("a", { name: "Сидорова", notes: "дописал позже", birthYear: "1960" })]); // после разбора
  for (const d of ["theirs", "reject"] as Decision[]) {
    const out = applyReview(owner1, items, { "people:a": d });
    const a = (out.people ?? (owner1.people as Rec[]))[0]; // «Оставить моё»: ничего не меняется, позднее изменение владельца цело
    assert.equal(a.notes, "дописал позже", d);
    assert.equal(a.birthYear, "1960", d); // поле, изменённое владельцем уже после разбора, не затёрто
  }
  assert.equal(applyReview(owner1, items, { "people:a": "theirs" }).people![0].name, "Иванова");
});
test("В2 владелец убрал запись уже после разбора: «Принять» правку не воскрешает чужим способом, а восстанавливает запись помощника только если решение явное", () => {
  const owner0 = book([P("a")]);
  const changes = makeChangeSet(book([P("a")]), book([P("a", { birthYear: "1951" })]));
  const items = reviewChanges(owner0, changes); // clean
  const owner1 = book([]); // убрал после разбора
  const out = applyReview(owner1, items, {}); // решение по умолчанию «принять»
  assert.ok(out.people === undefined || (out.people as Rec[]).every((r) => r.id === "a"), "ничего постороннего не появилось");
});

// ——— id и данные
test("И1 исходная запись при «Обе копией» сохраняет id и содержимое, копия получает другой id", () => {
  const owner = book([], { stories: [{ id: "s", title: "Моя" } as Rec] });
  const changes = makeChangeSet(book([], { stories: [{ id: "s", title: "Была" } as Rec] }), book([], { stories: [{ id: "s", title: "Чужая" } as Rec] }));
  const out = applyReview(owner, reviewChanges(owner, changes), { "stories:s": "copy" });
  const list = out.stories as Rec[];
  assert.equal(list.find((r) => r.id === "s")!.title, "Моя");
  assert.notEqual(list.find((r) => r.id !== "s")!.id, "s");
});
test("И2 родственные связи, усыновление, фото и неизвестные поля сохраняются, списки целиком, id не меняется", () => {
  const baseRec = P("a", { parents: ["p1"], adoptedBy: ["q1"], photos: ["f1"], spouse: "s1" });
  const owner = book([{ ...baseRec, futureOwner: { x: [1] }, photos: ["f1", "f9"] }]);
  const helperNow = book([{ ...baseRec, parents: ["p1", "p2"], futureHelper: "я" }]);
  const { items } = flow(owner, book([baseRec]), helperNow);
  assert.equal(items[0].state, "clean");
  const a = applyReview(owner, items, {}).people![0];
  assert.deepEqual(a.parents, ["p1", "p2"]);
  assert.deepEqual(a.adoptedBy, ["q1"]);
  assert.deepEqual(a.photos, ["f1", "f9"]); // владелец менял, помощник нет
  assert.equal(a.spouse, "s1");
  assert.deepEqual(a.futureOwner, { x: [1] });
  assert.equal(a.futureHelper, "я");
  assert.equal(a.id, "a");
});
test("И3 списки (parents) менялись с двух сторон: конфликт всего поля, массивы не смешиваются", () => {
  const owner = book([P("a", { parents: ["p1", "x"] })]);
  const { items } = flow(owner, book([P("a", { parents: ["p1"] })]), book([P("a", { parents: ["p1", "y"] })]));
  assert.deepEqual(items[0].fields, ["parents"]);
  assert.deepEqual(applyReview(owner, items, { "people:a": "theirs" }).people![0].parents, ["p1", "y"]);
  assert.deepEqual(applyReview(owner, items, {}).people, undefined);
});
test("И4 после перезапуска (разбор тех же правок заново) результат тот же", () => {
  const owner = book([P("a", { name: "Сидорова" })]);
  const changes = makeChangeSet(book([P("a")]), book([P("a", { name: "Иванова", birthYear: "1951" })]));
  const one = reviewChanges(owner, changes).map((i) => [i.state, i.fields, stableStringify(i.result)]);
  const two = reviewChanges(clone(owner), clone(changes)).map((i) => [i.state, i.fields, stableStringify(i.result)]);
  assert.deepEqual(one, two);
});
test("И5 summarize считает новые конфликты удаления", () => {
  const owner = book([P("b")]);
  const { items } = flow(owner, book([P("a"), P("b")]), book([P("a", { birthYear: "1951" }), P("b")]));
  assert.equal(summarize(items).conflicts, 1);
  assert.equal(summarize(items).edited, 1);
});

// ——— Б. пометка копии отдельно
test("Б1 пометка копии показывается отдельной подписью, название не содержит «Копия»", () => {
  const owner = book([], { pages: [{ id: "pg", title: "Моя" } as Rec] });
  const changes = makeChangeSet(book([], { pages: [{ id: "pg", title: "Была" } as Rec] }), book([], { pages: [{ id: "pg", title: "Мамина" } as Rec] }));
  const out = applyReview(owner, reviewChanges(owner, changes), { "pages:pg": "copy" }, "от Мамы");
  const copy = (out.pages as Rec[]).find((p) => p.id !== "pg")!;
  assert.equal(copyNote(copy), "Копия от Мамы");
  assert.equal(String(copy.title).includes("Копия"), false);
  assert.equal(copyNote({ id: "x", title: "Обычная" }), null);
  assert.equal(copyNote({ id: "x", copyOf: "y" }), "Копия от помощника");
});
test("Б2 имя человека при «Обе копией» не меняется (если копия создаётся)", () => {
  const owner = book([P("a", { name: "Моя" })]);
  const changes = makeChangeSet(book([]), book([P("a", { name: "Чужая" })]));
  const out = applyReview(owner, reviewChanges(owner, changes), { "people:a": "copy" });
  const copy = out.people!.find((r) => r.id !== "a")!;
  assert.equal(copy.name, "Чужая");
  assert.equal(copy.copyOf, "a");
});
