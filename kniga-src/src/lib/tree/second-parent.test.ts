// Этап 3а: правила добавления ребёнка со вторым родителем (чистые функции) на синтетических данных, без экрана.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Person as RodPerson } from "../rod/types.ts";
import { treeFromPeople } from "./from-people.ts";
import { partnersOf, planChildWithParents, secondParentOptions, similarPeople, type PlanInput } from "./second-parent.ts";

type P = RodPerson;
const p = (id: string, gender: "m" | "f", extra: Partial<P> = {}): P => ({ id, name: id, firstName: id, lastName: "", relation: "", birthYear: "", maidenName: "", notes: "", gender, fromFile: true, ...extra }) as P;
const kid = (name: string, extra: Partial<Omit<P, "id">> = {}): Omit<P, "id"> => ({ name, firstName: name, lastName: "", relation: "Сын", birthYear: "", maidenName: "", notes: "", gender: "m", ...extra }) as Omit<P, "id">;
let n = 0;
const run = (people: P[], first: string, second: PlanInput["second"], child: PlanInput["child"] = { mode: "new", person: kid("Новый") }, confirm: PlanInput["confirm"] = {}) =>
  planChildWithParents({ people, firstId: first, child, second, confirm, newId: () => `id${++n}` });
const must = (r: ReturnType<typeof run>) => { assert.equal(r.ok, true, JSON.stringify(r)); return r.ok ? r : (undefined as never); };
const j = (v: unknown) => JSON.stringify(v);
/** Все прежние люди после записи совпадают с прежними поля в поле, кроме перечисленных. */
function untouched(before: P[], after: P[], except: string[] = []) {
  for (const b of before) if (!except.includes(b.id)) assert.equal(j(after.find((a) => a.id === b.id)), j(b), `${b.id} изменён`);
}

const mother = (extra: Partial<P> = {}) => p("М", "f", extra);
const husband = (extra: Partial<P> = {}) => p("Х", "m", { spouse: "М", ...extra });

test("1. отчим: ребёнок с «неизвестным» отцом; муж матери родителем не становится, браки не тронуты", () => {
  const before = [mother({ spouse: "Х" }), husband()];
  const r = must(run(before, "М", { mode: "unknown" }));
  const c = r.people.find((x) => x.id === r.childId)!;
  assert.deepEqual(c.parents, ["М"]);
  assert.equal(c.parentsUnmarried, undefined);
  untouched(before, r.people);
});

test("2. мачеха: зеркально, из карточки отца", () => {
  const before = [p("О", "m", { spouse: "Ж" }), p("Ж", "f", { spouse: "О" })];
  const r = must(run(before, "О", { mode: "unknown" }));
  assert.deepEqual(r.people.find((x) => x.id === r.childId)!.parents, ["О"]);
  untouched(before, r.people);
});

test("предложенный партнёр записывается только при явном выборе, и пара остаётся как есть", () => {
  const before = [mother({ spouse: "Х" }), husband()];
  const opts = secondParentOptions(before, "М");
  assert.deepEqual(opts, [{ kind: "partner", id: "Х", status: "married", current: true }]);
  const r = must(run(before, "М", { mode: "partner", id: "Х" }));
  const c = r.people.find((x) => x.id === r.childId)!;
  assert.deepEqual(c.parents, ["М", "Х"]);
  assert.equal(c.parentsUnmarried, undefined, "у записанных супругов отметки нет");
  untouched(before, r.people);
});

test("3. ребёнок от другого мужчины при официальном муже: муж и брак не тронуты, пара без брака помечена", () => {
  const before = [mother({ spouse: "Х" }), husband(), p("Д", "m")];
  const r = must(run(before, "М", { mode: "existing", id: "Д" }));
  const c = r.people.find((x) => x.id === r.childId)!;
  assert.deepEqual(c.parents, ["М", "Д"]);
  assert.equal(c.parentsUnmarried, true);
  untouched(before, r.people);
  assert.equal(r.people.find((x) => x.id === "М")!.spouse, "Х");
  assert.equal(r.people.find((x) => x.id === "Д")!.spouse, undefined, "брак с Д не создан");
});

test("4. общий ребёнок без брака с новым человеком: новый без супруга, у ребёнка отметка, у остальных ничего", () => {
  const before = [mother()];
  const r = must(run(before, "М", { mode: "new", person: kid("Отец", { gender: "m", relation: "" }) }));
  const c = r.people.find((x) => x.id === r.childId)!;
  assert.equal(r.secondId && r.people.find((x) => x.id === r.secondId)!.firstName, "Отец");
  assert.deepEqual(c.parents, ["М", r.secondId]);
  assert.equal(c.parentsUnmarried, true);
  const fresh = r.people.find((x) => x.id === r.secondId)! as P;
  assert.ok(!fresh.spouse && !fresh.moreSpouses && !fresh.spouseStatus, "брак не создан");
  untouched(before, r.people);
});

test("5. повторный брак: оба партнёра предлагаются, текущий первым, бывший помечен; выбор бывшего не меняет статусов", () => {
  const before = [p("М", "f", { spouse: "Х2", moreSpouses: [{ id: "Х1", status: "divorced" }] }), p("Х1", "m"), p("Х2", "m", { spouse: "М" })];
  const opts = secondParentOptions(before, "М");
  assert.deepEqual(opts.map((o) => [o.id, o.status, o.current]), [["Х2", "married", true], ["Х1", "divorced", false]]);
  const r = must(run(before, "М", { mode: "partner", id: "Х1" }));
  assert.deepEqual(r.people.find((x) => x.id === r.childId)!.parents, ["М", "Х1"]);
  untouched(before, r.people);
});

test("6. неизвестный отец: только один родитель, никакого «Папа» не придумывается", () => {
  const r = must(run([mother()], "М", { mode: "unknown" }));
  assert.deepEqual(r.people.find((x) => x.id === r.childId)!.parents, ["М"]);
  assert.equal(r.people.length, 2);
});

test("7. усыновлённый: форма не трогает усыновителей и опекунов существующего ребёнка", () => {
  const before = [mother(), p("О", "m"), p("Н", "m"), p("Оп", "f"), p("К", "m", { parents: ["М"], adoptedBy: [{ id: "Н", year: "2000" }], caredBy: [{ id: "Оп", role: "guardian" }] })];
  const r = must(run(before, "М", { mode: "existing", id: "О" }, { mode: "existing", id: "К" }, { replaceParents: true }));
  const c = r.people.find((x) => x.id === "К")!;
  assert.deepEqual(c.parents, ["М", "О"]);
  assert.deepEqual(c.adoptedBy, [{ id: "Н", year: "2000" }]);
  assert.deepEqual(c.caredBy, [{ id: "Оп", role: "guardian" }]);
  untouched(before, r.people, ["К"]);
  // новый ребёнок усыновителей не получает
  const r2 = must(run(before, "М", { mode: "unknown" }));
  const nc = r2.people.find((x) => x.id === r2.childId)! as P;
  assert.ok(!nc.adoptedBy && !nc.caredBy);
});

test("перезапись родителей существующего ребёнка без подтверждения невозможна", () => {
  const before = [mother(), p("О", "m"), p("Д", "m"), p("К", "m", { parents: ["М", "О"] })];
  const r = run(before, "М", { mode: "existing", id: "Д" }, { mode: "existing", id: "К" });
  assert.equal(r.ok, false);
  assert.deepEqual(!r.ok && r.needs?.replaceParents, ["М", "О"]);
  assert.equal(j(before.find((x) => x.id === "К")!.parents), j(["М", "О"]), "исходные данные не изменены");
  // тот же состав родителей (подтверждение не нужно): без вопросов
  must(run(before, "М", { mode: "partner", id: "О" }, { mode: "existing", id: "К" }));
});

test("жёсткие запреты: сам себе, цикл, больше двух родителей не получится", () => {
  const people = [p("А", "m"), p("Б", "m", { parents: ["А"] }), p("В", "f", { parents: ["Б"] })];
  assert.match((run(people, "А", { mode: "existing", id: "А" }) as { errors: string[] }).errors[0]!, /первым/);
  assert.match((run(people, "Б", { mode: "unknown" }, { mode: "existing", id: "Б" }) as { errors: string[] }).errors[0]!, /собственным ребёнком/);
  // потомок становится родителем своего предка
  assert.match((run(people, "В", { mode: "unknown" }, { mode: "existing", id: "А" }) as { errors: string[] }).errors.join(" "), /зациклится/);
  assert.match((run(people, "Б", { mode: "existing", id: "В" }, { mode: "existing", id: "В" }) as { errors: string[] }).errors.join(" "), /собственным родителем|собственным ребёнком/);
  // у результата никогда больше двух родителей
  const r = must(run([mother(), p("О", "m")], "М", { mode: "existing", id: "О" }));
  assert.equal(r.people.find((x) => x.id === r.childId)!.parents!.length, 2);
  // второго родителя нет в древе
  assert.equal(run([mother()], "М", { mode: "existing", id: "нет" }).ok, false);
});

test("мягкие предупреждения: предок или потомок первого, родитель младше ребёнка; можно подтвердить", () => {
  const people = [p("Дед", "m"), p("Отец", "m", { parents: ["Дед"] })];
  const w = run(people, "Отец", { mode: "existing", id: "Дед" });
  assert.equal(w.ok, false);
  assert.equal(!w.ok && w.needs?.warnings?.length, 1);
  must(run(people, "Отец", { mode: "existing", id: "Дед" }, undefined, { warnings: true }));
  const young = [p("М", "f", { birthYear: "2010" })];
  const w2 = run(young, "М", { mode: "unknown" }, { mode: "new", person: kid("К", { birthYear: "2000" }) });
  assert.equal(!w2.ok && w2.needs?.warnings?.length, 1);
  must(run(young, "М", { mode: "unknown" }, { mode: "new", person: kid("К", { birthYear: "2000" }) }, { warnings: true }));
});

test("дубликаты: похожий второй родитель и похожий ребёнок спрашиваются, подтверждение «это другой человек» разрешает", () => {
  const people = [mother(), p("Иван", "m", { firstName: "Иван", lastName: "Иванов", birthYear: "1970" })];
  const draft = kid("Иван", { gender: "m", lastName: "иванов", birthYear: "1970", relation: "" });
  const r = run(people, "М", { mode: "new", person: draft });
  assert.equal(r.ok, false);
  assert.deepEqual(!r.ok && r.needs?.similar, ["Иван"]);
  must(run(people, "М", { mode: "new", person: draft }, undefined, { notDuplicate: true }));
  // другой год рождения: не похож
  assert.equal(run(people, "М", { mode: "new", person: { ...draft, birthYear: "1990" } }).ok, true);
  assert.equal(similarPeople(people, { firstName: "ИВАН", lastName: "Иванов", birthYear: "" }).length, 1);
  // ребёнок, уже записанный у этого родителя
  const withKid = [...people, p("Дочка", "f", { firstName: "Анна", lastName: "Иванова", parents: ["М"] })];
  assert.equal(run(withKid, "М", { mode: "unknown" }, { mode: "new", person: kid("Анна", { lastName: "Иванова" }) }).ok, false);
});

test("ошибка не оставляет следов: при отказе возвращается ни одного нового человека", () => {
  const before = [mother()];
  const copy = j(before);
  const r = run(before, "М", { mode: "new", person: kid("", { firstName: "" }) });
  assert.equal(r.ok, false);
  assert.equal(j(before), copy);
  assert.equal(run(before, "нет", { mode: "unknown" }).ok, false);
});

test("общий ребёнок и древо: пара без записи брака получает «Общий ребёнок», настоящая запись брака побеждает, старые пары остаются «браком»", () => {
  const unions = (people: P[]) => treeFromPeople(people).unions.filter((u) => u.partnerIds.length === 2);
  // пара «М и Д» без записи супруга, ребёнок помечен
  const base = [mother({ spouse: "Х" }), husband(), p("Д", "m")];
  const r = must(run(base, "М", { mode: "existing", id: "Д" }));
  const co = unions(r.people).find((u) => u.partnerIds.includes("Д"))!;
  assert.equal(co.status, "coparents");
  assert.equal(unions(r.people).find((u) => u.partnerIds.includes("Х"))!.status, "married", "брак с мужем остался браком");
  // позже их записали супругами: настоящий статус
  const married = r.people.map((x) => (x.id === "Д" ? { ...x, spouse: "М", spouseStatus: "partners" as const } : x));
  assert.equal(unions(married).find((u) => u.partnerIds.includes("Д"))!.status, "partner");
  // у ребёнка без отметки та же пара остаётся «браком», как в старых книгах
  const old = r.people.map((x) => (x.id === r.childId ? { ...x, parentsUnmarried: undefined } : x));
  assert.equal(unions(old).find((u) => u.partnerIds.includes("Д"))!.status, "married");
  // не у всех детей отметка: статус не меняется
  const second = must(run(r.people, "М", { mode: "existing", id: "Д" }, { mode: "new", person: kid("Второй") }));
  const noFlag = second.people.map((x) => (x.id === second.childId ? { ...x, parentsUnmarried: undefined } : x));
  assert.equal(unions(noFlag).find((u) => u.partnerIds.includes("Д"))!.status, "married");
});

test("сводка: partnersOf и секондParentOptions видят и записанных партнёров, и тех, с кем уже есть общий ребёнок", () => {
  const people = [p("М", "f", { spouse: "Х" }), p("Х", "m"), p("Д", "m"), p("К", "m", { parents: ["М", "Д"], parentsUnmarried: true })];
  assert.deepEqual(partnersOf(people, "М"), [{ id: "Х", status: "married" }]);
  assert.deepEqual(secondParentOptions(people, "М").map((o) => [o.id, o.kind]), [["Х", "partner"], ["Д", "coparent"]]);
});

test("старые книги: пары из детей по-прежнему «брак», статуса «Общий ребёнок» нет нигде", () => {
  for (const name of ["diag-1029-anon.json", "diag-1101-anon.json"]) {
    const people = (JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as { people: P[] }).people;
    assert.ok(treeFromPeople(people).unions.every((u) => u.status !== "coparents"));
  }
});
