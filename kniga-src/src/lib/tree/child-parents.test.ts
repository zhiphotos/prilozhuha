// Этап 3б: правила формы «Добавить ребёнка» для существующего ребёнка (на настоящем хранилище книги, синтетические люди).
import assert from "node:assert/strict";
import test from "node:test";

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
};
const g = globalThis as unknown as Record<string, unknown>;
g.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, setTimeout, clearTimeout, localStorage: g.localStorage, location: { href: "http://localhost/", origin: "http://localhost" } };
g.document = { addEventListener() {}, removeEventListener() {}, visibilityState: "visible" };

const { useRod } = await import("../rod/store.ts");
const { useTree } = await import("./ui-store.ts");
const { parentVariants, commitExistingChild, previewChange, cloudBlockMessage, NEW_PARENT } = await import("./child-parents.ts");
const { parentsDiff, replacePolicy } = await import("./second-parent.ts");
import type { CloudCheck } from "./second-parent.ts";
type Person = ReturnType<typeof useRod.getState>["people"][number];
const man = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, name: id, firstName: id, lastName: "", relation: "", birthYear: "", maidenName: "", notes: "", gender, fromFile: true, ...extra }) as Person;
const load = (people: Person[]) => { useRod.setState({ people: JSON.parse(JSON.stringify(people)) as Person[] }); };
const now = () => useRod.getState().people;
const kid = () => now().find((p) => p.id === "Р")!;
const snapshot = () => JSON.stringify(now());
const marriageFields = (people: Person[]) => JSON.stringify(people.map((p) => [p.id, p.spouse, p.spouseStatus, p.moreSpouses, p.unionFrom, p.unionTo, p.adoptedBy, p.caredBy]));
const sorted = (a?: string[]) => [...(a ?? [])].sort();
const state = () => ({ parents: (kid().parents ?? []).filter((id) => !id.startsWith("__")), unmarried: Boolean((kid() as { parentsUnmarried?: boolean }).parentsUnmarried) });

/** Обычный набор: Анна (А), Иван (И), Сергей (С), Ольга (О), Петр (П), ребёнок Р. */
const world = (parents: string[] | undefined, extra: Partial<Person> = {}) =>
  load([man("А", "f"), man("И", "m"), man("С", "m"), man("О", "f"), man("П", "m"), man("Р", "m", { ...(parents ? { parents } : {}), ...extra })]);

type Case = { name: string; before?: string[]; first: string; variant: string; second?: { mode: "existing"; id: string } | { mode: "unknown" }; expect: string[] };
const CASES: Case[] = [
  { name: "1. родителей нет: F и Z", first: "А", variant: "second", second: { mode: "existing", id: "С" }, expect: ["А", "С"] },
  { name: "2. родителей нет: F и «Неизвестно»", first: "А", variant: "second", second: { mode: "unknown" }, expect: ["А"] },
  { name: "3. только F, добавить Z", before: ["А"], first: "А", variant: "second", second: { mode: "existing", id: "С" }, expect: ["А", "С"] },
  { name: "4. только F, «Неизвестно»: без изменений", before: ["А"], first: "А", variant: "second", second: { mode: "unknown" }, expect: ["А"] },
  { name: "5. F и X, Z = X: без изменений", before: ["А", "И"], first: "А", variant: "second", second: { mode: "existing", id: "И" }, expect: ["А", "И"] },
  { name: "6. F и X, другой Z: X снимается (пример Анна, Иван, Сергей)", before: ["А", "И"], first: "А", variant: "second", second: { mode: "existing", id: "С" }, expect: ["А", "С"] },
  { name: "7. F и X, «Неизвестно»: X снимается", before: ["А", "И"], first: "А", variant: "second", second: { mode: "unknown" }, expect: ["А"] },
  { name: "8. только X, F не записан: добавить рядом", before: ["И"], first: "А", variant: "add", expect: ["И", "А"] },
  { name: "9. только X, F не записан: заменить X на F", before: ["И"], first: "А", variant: "replace-x", expect: ["А"] },
  { name: "9б. только X, F не записан: заменить X на F и Z", before: ["И"], first: "А", variant: "replace-one", second: { mode: "existing", id: "С" }, expect: ["А", "С"] },
  { name: "10. X и Y, F не записан: вместо X", before: ["И", "С"], first: "А", variant: "replace-x", expect: ["С", "А"] },
  { name: "11. X и Y, F не записан: вместо Y", before: ["И", "С"], first: "А", variant: "replace-y", expect: ["И", "А"] },
  { name: "12. X и Y, F не записан: заменить обоих на F и Z", before: ["И", "С"], first: "А", variant: "replace-both", second: { mode: "existing", id: "О" }, expect: ["А", "О"] },
  { name: "12б. X и Y, F не записан: заменить обоих на одного F", before: ["И", "С"], first: "А", variant: "replace-both", second: { mode: "unknown" }, expect: ["А"] },
];

for (const c of CASES) {
  test(`вариант ${c.name}`, () => {
    world(c.before, { adoptedBy: [{ id: "П" }], caredBy: [{ id: "О", role: "guardian" }] });
    const marriages = marriageFields(now());
    const vs = parentVariants(now(), c.first, "Р")!;
    const v = vs.variants.find((x) => x.id === c.variant)!;
    assert.ok(v && !v.disabled, "вариант доступен");
    const expected = state();
    const res = commitExistingChild({ childId: "Р", variant: v, pick: c.second, expected, replaceConfirmed: true, cloud: "checked" });
    assert.equal(res.ok, true, JSON.stringify(res));
    assert.deepEqual(sorted(kid().parents), sorted(c.expect));
    assert.ok((kid().parents ?? []).length <= 2, "не больше двух родителей");
    assert.equal(marriageFields(now()), marriages, "браки, усыновители и опекуны не тронуты");
    if ((c.before ?? []).includes(c.first)) assert.ok((kid().parents ?? []).includes(c.first), "первый родитель сохранён");
  });
}

test("при двух родителях вариант «Добавить» недоступен, ни один вариант не выбран заранее", () => {
  world(["И", "С"]);
  const vs = parentVariants(now(), "А", "Р")!;
  assert.equal(vs.mode, "choose");
  assert.equal(vs.variants.find((x) => x.id === "add")?.disabled?.includes("Нет свободного места"), true);
  assert.equal(vs.variants.length, 4);
});

test("программа сама никого не снимает: разрушительная запись без явного подтверждения не выполняется", () => {
  world(["А", "И"]);
  const before = snapshot();
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  const res = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: state(), replaceConfirmed: false, cloud: "checked" });
  assert.equal(res.ok, false);
  assert.equal("blocked" in res && res.blocked, "not-confirmed");
  assert.equal(snapshot(), before);
});

test("устаревшее подтверждение: родители изменились после показа экрана, запись отменена, старое подтверждение не годится", () => {
  world(["А", "И"]);
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  const seen = state(); // пользователь видел это
  useRod.setState({ people: now().map((p) => (p.id === "Р" ? ({ ...p, parents: ["А", "П"] } as Person) : p)) }); // другое устройство подтянулось
  const before = snapshot();
  const res = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: seen, replaceConfirmed: true, cloud: "checked" });
  assert.equal(res.ok, false);
  assert.ok(!res.ok && "needs" in res && res.needs?.stale === true);
  assert.deepEqual(!res.ok && "needs" in res && res.needs?.current, { parents: ["А", "П"], unmarried: false }, "форма получает актуальные данные");
  assert.equal(snapshot(), before, "ничего не записано: parents и parentsUnmarried прежние");
  const again = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: seen, replaceConfirmed: true, cloud: "checked" });
  assert.equal(again.ok, false, "старое подтверждение больше нельзя использовать");
  assert.equal(snapshot(), before);
  const fresh = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: state(), replaceConfirmed: true, cloud: "checked" });
  assert.equal(fresh.ok, true, "новое подтверждение по новому просмотру проходит");
  assert.deepEqual(sorted(kid().parents), ["А", "С"]);
});

test("устаревание только из-за parentsUnmarried при неизменном списке родителей", () => {
  world(["А", "И"]);
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  const seen = state();
  assert.equal(seen.unmarried, false);
  useRod.setState({ people: now().map((p) => (p.id === "Р" ? ({ ...p, parentsUnmarried: true } as Person) : p)) });
  const before = snapshot();
  const res = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: seen, replaceConfirmed: true, cloud: "checked" });
  assert.equal(res.ok, false);
  assert.ok(!res.ok && "needs" in res && res.needs?.stale === true);
  assert.equal(snapshot(), before, "обе величины остались прежними");
  const ok = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: state(), replaceConfirmed: true, cloud: "checked" });
  assert.equal(ok.ok, true);
});

test("успешное подтверждение, когда оба ожидаемых значения совпадают", () => {
  world(["А", "И"], { parentsUnmarried: true });
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  const res = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: { parents: ["И", "А"], unmarried: true }, replaceConfirmed: true, cloud: "checked" });
  assert.equal(res.ok, true, JSON.stringify(res));
});

test("parents и parentsUnmarried меняются согласованно", () => {
  // Анна и Сергей записаны супругами: общий ребёнок, отметка снимается
  load([man("А", "f", { spouse: "С" }), man("С", "m", { spouse: "А" }), man("И", "m"), man("Р", "m", { parents: ["А", "И"], parentsUnmarried: true })]);
  let v = parentVariants(now(), "А", "Р")!.variants[0]!;
  assert.equal(commitExistingChild({ childId: "Р", variant: v, pick: { mode: "partner", id: "С" }, expected: state(), replaceConfirmed: true, cloud: "checked" }).ok, true);
  assert.deepEqual(sorted(kid().parents), ["А", "С"]);
  assert.equal((kid() as { parentsUnmarried?: boolean }).parentsUnmarried, undefined, "пара записана супругами: отметки нет");
  // другой человек без записи брака: отметка ставится
  v = parentVariants(now(), "А", "Р")!.variants[0]!;
  assert.equal(commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "И" }, expected: state(), replaceConfirmed: true, cloud: "checked" }).ok, true);
  assert.equal((kid() as { parentsUnmarried?: boolean }).parentsUnmarried, true);
  // один родитель: отметка снимается
  v = parentVariants(now(), "А", "Р")!.variants[0]!;
  assert.equal(commitExistingChild({ childId: "Р", variant: v, pick: { mode: "unknown" }, expected: state(), replaceConfirmed: true, cloud: "checked" }).ok, true);
  assert.deepEqual(kid().parents, ["А"]);
  assert.equal((kid() as { parentsUnmarried?: boolean }).parentsUnmarried, undefined);
});

test("сохраняются все остальные поля карточки при замене", () => {
  const extra = { photo: "ф.jpg", notes: "заметка", birthYear: "1990", birthPlace: "город", deathYear: "2020", custom: { a: 1 }, adoptedBy: [{ id: "П", year: "1999" }], caredBy: [{ id: "О", role: "guardian" as const }], hobby: "рыбалка" } as Partial<Person>;
  world(["А", "И"], extra);
  const beforeKid = JSON.parse(JSON.stringify(kid())) as Record<string, unknown>;
  const others = JSON.stringify(now().filter((p) => p.id !== "Р"));
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  assert.equal(commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: state(), replaceConfirmed: true, cloud: "checked" }).ok, true);
  const after = JSON.parse(JSON.stringify(kid())) as Record<string, unknown>;
  const strip = (o: Record<string, unknown>) => { const c = { ...o }; delete c.parents; delete c.parentsUnmarried; return c; };
  assert.deepEqual(strip(after), strip(beforeKid), "все поля, кроме parents и parentsUnmarried, равны");
  assert.equal(JSON.stringify(now().filter((p) => p.id !== "Р")), others, "другие люди не изменились");
});

test("заглушки: у ребёнка заглушка и родитель, сравнение игнорирует заглушки, порядок и повторы", () => {
  world(["__место", "И", "И"]);
  const vs = parentVariants(now(), "А", "Р")!;
  assert.deepEqual(vs.before, ["И"], "заглушка не считается родителем");
  const v = vs.variants.find((x) => x.id === "add")!;
  const res = commitExistingChild({ childId: "Р", variant: { ...v, firstId: "И", second: { mode: "existing", id: "А" } }, expected: { parents: ["И", "__другая"], unmarried: false }, replaceConfirmed: true, cloud: "checked" });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(sorted(kid().parents), ["А", "И"]);
  assert.ok(!(kid().parents ?? []).some((id) => id.startsWith("__")), "заглушки в записанном списке нет");
});

test("защита Б: проверка облака не удалась, замена и снятие блокируются, данные не меняются", () => {
  for (const cloud of ["failed", "conflict", "busy", "timeout", "signed-out", "unknown"] as CloudCheck[]) {
    world(["А", "И"]);
    const before = snapshot();
    const replace = parentVariants(now(), "А", "Р")!.variants[0]!;
    const r1 = commitExistingChild({ childId: "Р", variant: replace, pick: { mode: "existing", id: "С" }, expected: state(), replaceConfirmed: true, cloud });
    assert.equal(r1.ok, false, cloud);
    assert.equal("blocked" in r1 && r1.blocked, "cloud-unchecked");
    const r2 = commitExistingChild({ childId: "Р", variant: replace, pick: { mode: "unknown" }, expected: state(), replaceConfirmed: true, cloud });
    assert.equal("blocked" in r2 && r2.blocked, "cloud-unchecked", "снятие тоже блокируется");
    assert.equal(snapshot(), before, "ни parents, ни parentsUnmarried не менялись");
  }
});

test("защита Б: добавление без удаления разрешено и при неудачной проверке", () => {
  for (const cloud of ["failed", "conflict", "busy", "timeout", "signed-out", "unknown"] as CloudCheck[]) {
    world(["И"]);
    const add = parentVariants(now(), "А", "Р")!.variants.find((x) => x.id === "add")!;
    const res = commitExistingChild({ childId: "Р", variant: add, expected: state(), replaceConfirmed: false, cloud });
    assert.equal(res.ok, true, cloud);
    assert.deepEqual(sorted(kid().parents), ["А", "И"]);
  }
});

test("замена разрешена без аккаунта, облачной копии и второго устройства (no-cloud)", () => {
  world(["А", "И"]);
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  const res = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: state(), replaceConfirmed: true, cloud: "no-cloud" });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(sorted(kid().parents), ["А", "С"]);
});

test("replacePolicy и parentsDiff только считают: данные и аргументы не меняются", () => {
  const before = ["А", "И", "__х"];
  const copy = [...before];
  const d = parentsDiff(before, ["А", "С"]);
  assert.deepEqual(before, copy);
  assert.deepEqual({ kept: d.kept, removed: d.removed, added: d.added, destructive: d.destructive, unchanged: d.unchanged }, { kept: ["А"], removed: ["И"], added: ["С"], destructive: true, unchanged: false });
  assert.equal(parentsDiff(["А"], ["А", "С"]).destructive, false, "добавление не разрушительное");
  assert.equal(parentsDiff(["А", "И"], ["И", "А"]).unchanged, true);
  for (const cloud of ["checked", "no-cloud"] as CloudCheck[]) assert.equal(replacePolicy(d, cloud).allowed, true);
  for (const cloud of ["failed", "conflict", "busy", "timeout", "signed-out", "unknown"] as CloudCheck[]) assert.equal(replacePolicy(d, cloud).allowed, false);
  assert.equal(replacePolicy(parentsDiff(["А"], ["А", "С"]), "failed").allowed, true);
});

test("действие этапа 3а без нового поля работает как раньше", () => {
  world(["А", "И"]);
  const first = useTree.getState().attachChildWithParents("А", "Р", { mode: "existing", id: "С" });
  assert.equal(first.ok, false);
  assert.ok(!first.ok && first.needs?.replaceParents, "как в 3а: нужно подтверждение замены");
  assert.equal(useTree.getState().attachChildWithParents("А", "Р", { mode: "existing", id: "С" }, { replaceParents: true }).ok, true);
  assert.deepEqual(sorted(kid().parents), ["А", "С"]);
});

test("новый человек во втором родителе отмечается в расчёте, брак никогда не создаётся", () => {
  world(["А", "И"]);
  const marriages = marriageFields(now());
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  const p = previewChange(now(), "Р", v, { mode: "new", draft: { firstName: "Новый" } as never })!;
  assert.deepEqual(p.diff.added, [NEW_PARENT]);
  assert.equal(marriageFields(now()), marriages);
});

test("замена запрещена, если книга раньше синхронизировалась, а вход не выполнен (signed-out); сообщение просит войти", () => {
  world(["А", "И"]);
  const before = snapshot();
  const v = parentVariants(now(), "А", "Р")!.variants[0]!;
  const res = commitExistingChild({ childId: "Р", variant: v, pick: { mode: "existing", id: "С" }, expected: state(), replaceConfirmed: true, cloud: "signed-out" });
  assert.equal(res.ok, false);
  assert.equal("blocked" in res && res.blocked, "cloud-unchecked");
  assert.ok(!res.ok && res.errors.join(" ").includes("не вошли"), "в сообщении причина: нужно войти");
  assert.equal(snapshot(), before, "parents и parentsUnmarried не менялись");
  assert.notEqual(cloudBlockMessage("signed-out"), cloudBlockMessage("failed"));
  assert.ok(cloudBlockMessage("unknown").includes("есть ли у этой книги копия в облаке"));
});
