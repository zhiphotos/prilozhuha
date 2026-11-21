/**
 * С-3а: характеризационные тесты. Они фиксируют, КАК СЕЙЧАС слияние работает в трёх местах:
 *   R – reviewChanges + applyReview + defaultDecision (владелец разбирает правки помощника, helper-changes.ts),
 *   J – judge (помощник определяет, что с отправленным сделал владелец, helper-verdicts.ts),
 *   O – helperRoundWith (помощник получает новую версию владельца и накладывает на неё не принятое, helper-auto.ts).
 * Это НЕ эталон правильного поведения. Где текущее поведение расходится с решениями по С-3
 * (удаление против правки, порядок ключей, статус «не принято» при дописанной владельцем записи),
 * тест помечен «РАСХОЖДЕНИЕ» и в С-3в/С-3г должен быть сознательно изменён, а не случайно сломан.
 * Правки в сам алгоритм сюда не входят: тесты только читают текущий код.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { applyReview, defaultDecision, makeChangeSet, reviewChanges, type Book, type Change, type Decision, type Rec } from "./helper-changes.ts";
import { helperRoundWith, type AutoSession } from "./helper-auto.ts";
import { judge } from "./helper-verdicts.ts";

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const P = (o: Record<string, unknown> = {}): Rec => ({ id: "p", name: "Анна", birthYear: "1950", ...o });
const book = (...people: Rec[]): Book => ({ people, places: [], stories: [], notes: [], pages: [], photos: [] });
const chg = (kind: Change["kind"], before?: Rec, after?: Rec): Change => ({ key: "people", kind, id: "p", before, after });

/** R: одна правка помощника против книги владельца. */
const review = (owner: Rec | undefined, change: Change) => reviewChanges(owner ? book(owner) : book(), [change])[0];
/** R: решение по умолчанию и результат применения. */
const applied = (owner: Rec | undefined, change: Change, decision?: Decision) => {
  const mine = owner ? book(owner) : book();
  const items = reviewChanges(mine, [change]);
  const out = applyReview(mine, items, decision ? { "people:p": decision } : {});
  return (out.people ?? mine.people) as Rec[];
};
/** J: что решит judge про одну правку: base -> sent, а владелец теперь выложил owner. */
const verdictOf = (base: Rec | undefined, sent: Rec | undefined, owner: Rec | undefined) => {
  const r = judge(book(...(base ? [base] : [])), book(...(sent ? [sent] : [])), book(...(owner ? [owner] : [])), 1);
  return { state: r.verdicts[0]?.state, held: r.held.length, fields: r.verdicts[0]?.fields, theirs: r.verdicts[0]?.theirs };
};
/** O: обход помощника: у него книга sent (= его правки), версия владельца вышла новая. */
async function overlay(base: Rec | undefined, sent: Rec | undefined, owner: Rec | undefined) {
  const baseBook = book(...(base ? [base] : []));
  const sentBook = book(...(sent ? [sent] : []));
  let session: AutoSession & { room: string } = { room: "r", invite: "i", who: "М", base: baseBook, baseAt: 1, sent: sentBook };
  const lists = clone(sentBook) as Record<string, unknown>;
  const result = await helperRoundWith<AutoSession & { room: string }>({
    session: () => session,
    saveSession: (s) => {
      session = s;
    },
    lists: () => lists as unknown as Book,
    setLists: (patch) => Object.assign(lists, clone(patch)),
    send: async () => {
      throw new Error("отправлять нечего");
    },
    poll: async () => ({ ok: true, base: clone(book(...(owner ? [owner] : []))), at: 2, waiting: 0 }),
    downloadMedia: async () => {},
  });
  return { result, people: (lists.people ?? []) as Rec[], session };
}

// ═══ R. reviewChanges / applyReview (владелец разбирает правки помощника) ═══
// R-add
test("R1 добавление, у владельца такой записи нет: «clean», принимается по умолчанию", () => {
  const item = review(undefined, chg("add", undefined, P()));
  assert.equal(item.state, "clean");
  assert.equal(defaultDecision(item), "accept");
  assert.deepEqual(applied(undefined, chg("add", undefined, P())), [P()]);
});
test("R2 добавление, у владельца уже точно такая запись: «already», ничего не делается", () => {
  assert.equal(review(P(), chg("add", undefined, P())).state, "already");
});
test("R3 добавление с тем же id, содержимое разное: «conflict», по умолчанию отклонено, поля = различия", () => {
  const item = review(P({ name: "Анна Сидорова" }), chg("add", undefined, P({ name: "Анна Иванова" })));
  assert.equal(item.state, "conflict");
  assert.deepEqual(item.fields, ["name"]);
  assert.equal(defaultDecision(item), "reject");
  assert.equal(applied(P({ name: "Анна Сидорова" }), chg("add", undefined, P({ name: "Анна Иванова" })))[0].name, "Анна Сидорова");
});
test("R3б «Взять помощника» при конфликте добавления заменяет запись целиком; «Обе, копией» добавляет вторую с новым id", () => {
  const owner = P({ name: "Анна Сидорова" });
  const change = chg("add", undefined, P({ name: "Анна Иванова" }));
  assert.equal(applied(owner, change, "theirs")[0].name, "Анна Иванова");
  const copy = applied(owner, change, "copy");
  assert.equal(copy.length, 2);
  assert.notEqual(copy[1].id, "p");
});
// R-edit
test("R4 правка поля, владелец запись не менял: «clean»", () => {
  const item = review(P(), chg("edit", P(), P({ birthYear: "1951" })));
  assert.equal(item.state, "clean");
  assert.equal((item.result as Rec).birthYear, "1951");
});
test("R5 правка одного поля, владелец менял другое: «clean», оба изменения вместе", () => {
  const item = review(P({ notes: "заметка владельца" }), chg("edit", P(), P({ birthYear: "1951" })));
  assert.equal(item.state, "clean");
  assert.equal((item.result as Rec).birthYear, "1951");
  assert.equal((item.result as Rec).notes, "заметка владельца");
});
test("R6 то же поле изменено по-разному: «conflict», поля = только спорные, по умолчанию отклонено, у владельца остаётся его", () => {
  const owner = P({ name: "Анна Сидорова" });
  const change = chg("edit", P(), P({ name: "Анна Иванова", birthYear: "1951" }));
  const item = review(owner, change);
  assert.equal(item.state, "conflict");
  assert.deepEqual(item.fields, ["name"]);
  assert.equal(defaultDecision(item), "reject");
  assert.equal(applied(owner, change)[0].name, "Анна Сидорова");
  assert.equal(applied(owner, change)[0].birthYear, "1950"); // при «отклонить» не берётся и неспорная часть
});
test("R6б «Взять помощника» берёт спорное поле и неспорное; «Оставить моё» не меняет ничего", () => {
  const owner = P({ name: "Анна Сидорова" });
  const change = chg("edit", P(), P({ name: "Анна Иванова", birthYear: "1951" }));
  const theirs = applied(owner, change, "theirs")[0];
  assert.equal(theirs.name, "Анна Иванова");
  assert.equal(theirs.birthYear, "1951");
  assert.deepEqual(applied(owner, change, "mine")[0], owner);
});
test("R7 оба изменили поле на одно и то же значение: не конфликт", () => {
  const item = review(P({ name: "Анна Иванова", notes: "x" }), chg("edit", P(), P({ name: "Анна Иванова" })));
  assert.equal(item.state, "clean");
});
test("R8 помощник убрал поле (его нет в записи после), владелец не менял: «clean», поле убирается", () => {
  const before = P({ notes: "старая" });
  const after = P();
  const item = review(before, chg("edit", before, after));
  assert.equal(item.state, "clean");
  assert.equal("notes" in (item.result as Rec), false);
});
test("R9 запись у владельца уже равна правке: «already»", () => {
  assert.equal(review(P({ birthYear: "1951" }), chg("edit", P(), P({ birthYear: "1951" }))).state, "already");
});
test("R10 владелец удалил запись, помощник её правил: «gone», по умолчанию ПРИНИМАЕТСЯ и запись возвращается с правкой помощника", () => {
  const change = chg("edit", P(), P({ birthYear: "1951" }));
  const item = review(undefined, change);
  assert.equal(item.state, "gone");
  assert.equal(defaultDecision(item), "accept");
  assert.deepEqual(applied(undefined, change), [P({ birthYear: "1951" })]); // РАСХОЖДЕНИЕ с решением С-3 (запись остаётся, конфликт, решает владелец): сейчас воскрешается молча
});
// R-remove
test("R11 помощник убрал запись, у владельца она есть и не менялась: «remove», по умолчанию отклонено; «Убрать» убирает", () => {
  const item = review(P(), chg("remove", P()));
  assert.equal(item.state, "remove");
  assert.equal(defaultDecision(item), "reject");
  assert.deepEqual(applied(P(), chg("remove", P())), [P()]);
  assert.deepEqual(applied(P(), chg("remove", P()), "accept"), []);
});
test("R12 помощник убрал запись, владелец её уже убрал: «already»", () => {
  assert.equal(review(undefined, chg("remove", P())).state, "already");
});
test("R13 помощник убрал запись, а владелец её ПРАВИЛ: всё равно «remove», не «conflict»; при «Убрать» правка владельца пропадает", () => {
  const owner = P({ name: "Анна Сидорова" });
  const item = review(owner, chg("remove", P()));
  assert.equal(item.state, "remove"); // РАСХОЖДЕНИЕ с J (там это конфликт) и с решением С-3
  assert.deepEqual(applied(owner, chg("remove", P()), "accept"), []);
});
// R-прочее
test("R14 неизвестные поля новых версий приложения сохраняются при слиянии (и у владельца, и у помощника)", () => {
  const owner = P({ futureOwner: { a: 1 } });
  const after = P({ birthYear: "1951", futureHelper: [1, 2] });
  const out = (review(owner, chg("edit", P(), after)).result as Rec);
  assert.deepEqual(out.futureOwner, { a: 1 });
  assert.deepEqual(out.futureHelper, [1, 2]);
});
test("R15 списки (parents) сравниваются целиком: разные массивы у двух сторон это конфликт поля, не смесь", () => {
  const before = P({ parents: ["a"] });
  const item = review(P({ parents: ["a", "b"] }), chg("edit", before, P({ parents: ["a", "c"] })));
  assert.equal(item.state, "conflict");
  assert.deepEqual(item.fields, ["parents"]);
  assert.deepEqual((item.result as Rec).parents, ["a", "c"]); // «Взять помощника» заменяет массив целиком, части не смешиваются
});
test("R16 id записи не меняется ни при каком решении", () => {
  const owner = P({ name: "Анна Сидорова" });
  for (const d of ["accept", "reject", "theirs", "mine"] as Decision[]) {
    for (const rec of applied(owner, chg("edit", P(), P({ name: "Анна Иванова" })), d)) assert.equal(rec.id, "p");
  }
});
test("R17 порядок ключей в записи не создаёт конфликт при сравнении полей (поля сравниваются по одному)", () => {
  const owner: Rec = { birthYear: "1950", name: "Анна", id: "p" };
  const item = review(owner, chg("edit", P(), P({ birthYear: "1951" })));
  assert.equal(item.state, "clean");
});
test("R18 порядок ключей ВНУТРИ вложенного значения: разный порядок считается разным значением (ложный конфликт)", () => {
  const before = P({ geo: { lat: 1, lng: 2 } });
  const owner = P({ geo: { lng: 2, lat: 1 } }); // то же значение, другой порядок
  const item = review(owner, chg("edit", before, P({ geo: { lat: 5, lng: 2 } })));
  assert.equal(item.state, "conflict"); // РАСХОЖДЕНИЕ: по смыслу владелец поле не менял, конфликта быть не должно
  assert.deepEqual(item.fields, ["geo"]);
});

// ═══ J. judge (что владелец сделал с отправленным) ═══
test("J1 владелец принял правку целиком: accepted", () => {
  assert.deepEqual(verdictOf(P(), P({ birthYear: "1951" }), P({ birthYear: "1951" })), { state: "accepted", held: 0, fields: undefined, theirs: undefined });
});
test("J2 владелец запись не менял и правку не принял: rejected", () => {
  const v = verdictOf(P(), P({ birthYear: "1951" }), P());
  assert.equal(v.state, "rejected");
  assert.equal(v.held, 1);
});
test("J3 владелец менял то же поле по-другому: conflict, поля и его запись сохранены", () => {
  const v = verdictOf(P(), P({ name: "Анна Иванова" }), P({ name: "Анна Сидорова" }));
  assert.equal(v.state, "conflict");
  assert.deepEqual(v.fields, ["name"]);
  assert.equal((v.theirs as Rec).name, "Анна Сидорова");
});
test("J4 владелец менял другое поле: rejected, не conflict", () => {
  assert.equal(verdictOf(P(), P({ name: "Анна Иванова" }), P({ notes: "x" })).state, "rejected");
});
test("J5 владелец принял правку И дописал другое поле: judge говорит accepted (С-3в: проверяются только поля, которые менял помощник)", () => {
  const v = verdictOf(P(), P({ birthYear: "1951" }), P({ birthYear: "1951", notes: "дописал" }));
  assert.equal(v.state, "accepted"); // было rejected (расхождение 2 из С-3а), исправлено подключением merge-core
  assert.equal(v.held, 0);
});
test("J6 то же значение, но другой порядок ключей верхнего уровня: judge говорит accepted (С-3в, расхождение 3)", () => {
  const owner: Rec = { birthYear: "1951", name: "Анна", id: "p" };
  assert.equal(verdictOf(P(), P({ birthYear: "1951" }), owner).state, "accepted");
});
test("J7 добавление: владелец принял (запись равна) — accepted; владелец не принял — rejected; у владельца своя запись с тем же id — conflict", () => {
  assert.equal(verdictOf(undefined, P(), P()).state, "accepted");
  assert.equal(verdictOf(undefined, P(), undefined).state, "rejected");
  assert.equal(verdictOf(undefined, P(), P({ name: "Другая" })).state, "conflict");
});
test("J8 удаление: владелец тоже убрал — accepted; не убрал и не менял — rejected; правил — conflict", () => {
  assert.equal(verdictOf(P(), undefined, undefined).state, "accepted");
  assert.equal(verdictOf(P(), undefined, P()).state, "rejected");
  assert.equal(verdictOf(P(), undefined, P({ name: "Анна Сидорова" })).state, "conflict");
});
test("J9 правка, а владелец запись удалил: conflict, его «запись» пуста", () => {
  const v = verdictOf(P(), P({ birthYear: "1951" }), undefined);
  assert.equal(v.state, "conflict");
  assert.equal(v.theirs, undefined);
});

// ═══ O. helperRoundWith (наложение не принятого на новую версию владельца) ═══
test("O1 правка не принята, владелец менял другое поле: на экране помощника обе правки, результат «held»", async () => {
  const r = await overlay(P(), P({ birthYear: "1951" }), P({ notes: "владелец" }));
  assert.equal(r.result, "held");
  assert.equal(r.people[0].birthYear, "1951");
  assert.equal(r.people[0].notes, "владелец");
});
test("O2 то же поле: у помощника остаётся его значение, значение владельца хранится только в verdict.theirs", async () => {
  const r = await overlay(P(), P({ name: "Анна Иванова" }), P({ name: "Анна Сидорова" }));
  assert.equal(r.people[0].name, "Анна Иванова");
  const v = r.session.verdicts?.[0];
  assert.equal(v?.state, "conflict");
  assert.equal((v?.theirs as Rec).name, "Анна Сидорова");
});
test("O3 принято целиком: «updated», у помощника версия владельца, sent снят", async () => {
  const r = await overlay(P(), P({ birthYear: "1951" }), P({ birthYear: "1951" }));
  assert.equal(r.result, "updated");
  assert.equal(r.session.sent, undefined);
});
test("O4 помощник убрал запись, владелец не принял: запись остаётся убранной у помощника", async () => {
  const r = await overlay(P(), undefined, P());
  assert.equal(r.result, "held");
  assert.deepEqual(r.people, []);
});
test("O5 помощник убрал запись, а владелец её правил: у помощника запись убрана, правка владельца только в verdict.theirs", async () => {
  const r = await overlay(P(), undefined, P({ name: "Анна Сидорова" }));
  assert.deepEqual(r.people, []);
  assert.equal(r.session.verdicts?.[0]?.state, "conflict");
  assert.equal((r.session.verdicts?.[0]?.theirs as Rec).name, "Анна Сидорова");
});
test("O6 помощник правил запись, владелец её удалил: у помощника запись возвращается с его правкой (воскрешение), статус conflict", async () => {
  const r = await overlay(P(), P({ birthYear: "1951" }), undefined);
  assert.deepEqual(r.people, [P({ birthYear: "1951" })]);
  assert.equal(r.session.verdicts?.[0]?.state, "conflict");
});
test("O7 добавление с тем же id, у владельца другая запись: у помощника остаётся его запись (владельца не видно), conflict", async () => {
  const r = await overlay(undefined, P({ name: "Анна Иванова" }), P({ name: "Анна Сидорова" }));
  assert.equal(r.people[0].name, "Анна Иванова");
  assert.equal(r.session.verdicts?.[0]?.state, "conflict");
});
test("O8 фото и родственные связи: список parents у помощника сохраняется целиком, id не меняются", async () => {
  const base = P({ parents: ["a"] });
  const r = await overlay(base, P({ parents: ["a", "c"] }), P({ parents: ["a", "b"] }));
  assert.deepEqual(r.people[0].parents, ["a", "c"]);
  assert.equal(r.people[0].id, "p");
  assert.deepEqual((r.session.verdicts?.[0]?.theirs as Rec).parents, ["a", "b"]);
});
test("O9 неизвестные поля владельца и помощника при наложении сохраняются", async () => {
  const r = await overlay(P(), P({ birthYear: "1951", futureHelper: 1 }), P({ notes: "в", futureOwner: 2 }));
  assert.equal(r.people[0].futureHelper, 1);
  assert.equal(r.people[0].futureOwner, 2);
});
test("O10 после наложения следующий обход ничего заново не отправляет (набор правок помощника не растёт)", async () => {
  const r = await overlay(P(), P({ birthYear: "1951" }), P({ notes: "владелец" }));
  const pendingNow = makeChangeSet((r.session.sent ?? r.session.base) as Book, book(...r.people));
  assert.equal(pendingNow.length, 0);
});
