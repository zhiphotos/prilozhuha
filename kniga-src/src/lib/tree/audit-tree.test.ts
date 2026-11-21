// Аудит построения древа (ветка claude/audit-tree-tests, в main не сливается). Только чтение: проверяют инварианты раскладки на синтетических данных.
// Известные дефекты помечены { todo }: тест описывает ПРАВИЛЬНОЕ поведение и пока падает; node:test не считает todo провалом.
import assert from "node:assert/strict";
import test from "node:test";
import { buildLayout } from "./layout-engine.ts";
import { treeFromPeople } from "./from-people.ts";
import { annaPeople, artificial, elizavetaTangled, small } from "./family-fixtures.ts";
import type { Person as RodPerson } from "../rod/types.ts";
import type { Person, Union } from "./types.ts";

const P = (id: string, g: Person["gender"] = "u"): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender: g, birthYear: "", deathYear: "", photo: "", note: "" });
const U = (id: string, p: string[], k: string[] = [], status: Union["status"] = "married"): Union => ({ id, partnerIds: p, childIds: k, status, startYear: "", endYear: "" });
const R = (id: string, relation: string, x: Partial<RodPerson> = {}): RodPerson => ({ id, name: id, relation, maidenName: "", notes: "", birthYear: "", ...x }) as RodPerson;
const ENGINES = ["classic", "family"] as const;

function inspect(people: Person[], unions: Union[], owner: string, engine: (typeof ENGINES)[number]) {
  const L = buildLayout(people, unions, owner, "down", { engine, ownerId: owner });
  const seen = new Map<string, number>();
  for (const n of L.nodes) seen.set(n.id, (seen.get(n.id) ?? 0) + 1);
  const lost = people.filter((p) => !seen.has(p.id)).map((p) => p.id);
  const dup = [...seen].filter(([, c]) => c > 1).map(([id]) => id);
  const outside = L.nodes.filter((n) => n.x - 84 < 0 || n.x + 84 > L.width || n.y - 36 < 0 || n.y + 36 > L.height).map((n) => n.id);
  const rows = new Map<number, number[]>();
  for (const n of L.nodes) (rows.get(Math.round(n.y)) ?? rows.set(Math.round(n.y), []).get(Math.round(n.y))!).push(n.x);
  let overlaps = 0;
  for (const xs of rows.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) if (xs[i]! - xs[i - 1]! < 167) overlaps++; }
  const y = new Map(L.nodes.map((n) => [n.id, n.y]));
  let wrongGen = 0;
  for (const u of unions) for (const a of u.partnerIds) for (const c of u.childIds) { const ya = y.get(a), yc = y.get(c); if (ya !== undefined && yc !== undefined && !(ya < yc)) wrongGen++; }
  const xs = L.nodes.map((n) => n.x);
  return { L, lost, dup, outside, overlaps, wrongGen, padL: Math.min(...xs) - 84, padR: L.width - Math.max(...xs) - 84 };
}

function chain(depth: number) { const ps = [P("g0")]; const us: Union[] = []; for (let i = 1; i < depth; i++) { ps.push(P("g" + i)); us.push(U("u" + i, ["g" + i], ["g" + (i - 1)])); } return { ps, us }; }
function wide(kids: number) { const ps = [P("a", "m"), P("b", "f")]; const k: string[] = []; for (let i = 0; i < kids; i++) { ps.push(P("k" + i)); k.push("k" + i); } return { ps, us: [U("u", ["a", "b"], k)] }; }
/** Потомки вниз от «o»: везде женатые дети, 2–3 ребёнка в браке (псевдослучайно, но детерминированно). */
function descendants(total: number) {
  let s = 1; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const people = [P("o", "m")], unions: Union[] = []; let n = 0;
  const mk = (g: "m" | "f") => { const p = P("p" + n++, g); people.push(p); return p.id; };
  const root = U("u0", ["o", mk("f")]); unions.push(root);
  let frontier = [root];
  while (people.length < total && frontier.length) {
    const next: Union[] = [];
    for (const u of frontier) for (let i = 0, c = 2 + Math.floor(rnd() * 2); i < c && people.length < total; i++) {
      const kid = mk(rnd() < 0.5 ? "m" : "f"); u.childIds.push(kid);
      if (people.length < total) { const nu = U("v" + n, [kid, mk(rnd() < 0.5 ? "m" : "f")]); unions.push(nu); next.push(nu); }
    }
    frontier = next;
  }
  return { people, unions };
}

for (const engine of ENGINES) {
  test(`[${engine}] смена центра на каждого: никого не потеряно, нет дублей, наложений, обрезания, родитель выше ребёнка`, () => {
    const sets: [string, Person[], Union[]][] = [["small", small().people, small().unions], ["artificial", artificial().people, artificial().unions], ["elizavetaTangled", elizavetaTangled().people, elizavetaTangled().unions]];
    const anna = treeFromPeople(annaPeople()); sets.push(["anna", anna.people, anna.unions]);
    for (const [name, people, unions] of sets) for (const p of people) {
      const r = inspect(people, unions, p.id, engine);
      const where = `${name}/${p.id}`;
      assert.deepEqual(r.lost, [], `потеряны: ${where}`); assert.deepEqual(r.dup, [], `дубли: ${where}`); assert.deepEqual(r.outside, [], `вне листа: ${where}`);
      assert.equal(r.overlaps, 0, `наложения плашек: ${where}`); assert.equal(r.wrongGen, 0, `поколения: ${where}`);
    }
  });
  test(`[${engine}] поля слева и справа равны (схема симметрична, плашки не обрезаются)`, () => {
    for (const n of [1, 5, 20, 100, 300]) { const d = descendants(n); const r = inspect(d.people, d.unions, "o", engine); assert.ok(Math.abs(r.padL - r.padR) <= 1, `n=${n}: ${r.padL}/${r.padR}`); assert.ok(r.padL >= 72 - 1, `n=${n} поле слева ${r.padL}`); }
  });
  test(`[${engine}] большие деревья 500 и 2000 человек: все на месте, без наложений, быстро`, () => {
    for (const n of [500, 2000]) { const d = descendants(n); const t = performance.now(); const r = inspect(d.people, d.unions, "o", engine); const ms = performance.now() - t; assert.deepEqual(r.lost, []); assert.deepEqual(r.dup, []); assert.equal(r.overlaps, 0); assert.ok(ms < 3000, `n=${n} ${Math.round(ms)}мс`); }
  });
  test(`[${engine}] грязные данные не роняют раскладку и не теряют людей`, () => {
    const cases: [string, Person[], Union[], string][] = [
      ["цикл родитель-ребёнок", [P("a", "m"), P("b", "f"), P("c", "m")], [U("u1", ["a"], ["b"]), U("u2", ["b"], ["a"]), U("u3", ["c"], ["a"])], "a"],
      ["человек сам себе ребёнок", [P("a", "m"), P("b", "f")], [U("u1", ["a", "b"], ["a"])], "a"],
      ["двое пар родителей у одного ребёнка", [P("a"), P("b"), P("c"), P("d"), P("k")], [U("u1", ["a", "b"], ["k"]), U("u2", ["c", "d"], ["k"])], "k"],
      ["ребёнок записан дважды в одном союзе", [P("a"), P("b"), P("k")], [U("u1", ["a", "b"], ["k", "k"])], "k"],
      ["неизвестные id в союзе", [P("a"), P("k")], [U("u1", ["a", "ghost"], ["k", "ghost2"])], "k"],
      ["союз без партнёров", [P("a")], [U("u1", [], [])], "a"],
      ["три брака подряд", [P("a", "m"), P("b", "f"), P("c", "f"), P("d", "f"), P("k1"), P("k2"), P("k3")], [U("u1", ["a", "b"], ["k1"], "divorced"), U("u2", ["a", "c"], ["k2"], "divorced"), U("u3", ["a", "d"], ["k3"])], "a"],
      ["дубль союза", [P("a", "m"), P("b", "f"), P("k")], [U("u1", ["a", "b"], ["k"]), U("u2", ["a", "b"], ["k"])], "a"],
      ["центра нет в списке", [P("a")], [], "нет-такого"],
      ["цепь из 60 поколений", chain(60).ps, chain(60).us, "g0"],
      ["40 детей у одной пары", wide(40).ps, wide(40).us, "a"],
    ];
    for (const [name, people, unions, owner] of cases) { const r = inspect(people, unions, owner, engine); assert.deepEqual(r.lost, [], name); assert.deepEqual(r.dup, [], name); assert.equal(r.overlaps, 0, name); assert.deepEqual(r.outside, [], name); }
  });
}

// ── Известные дефекты (todo: правильное поведение, пока не соблюдается) ──
test("ДЕФЕКТ T-1: «двоюродный брат» не должен становиться родным братом через заготовки родителей", { todo: "from-people.ts:214 использует roleOf()==='sibling' вместо isOwnSibling()" }, () => {
  const d = treeFromPeople([R("me", "Я"), R("c", "Двоюродный брат")]);
  const asSibling = d.unions.some((u) => u.childIds.includes("me") && u.childIds.includes("c"));
  assert.equal(asSibling, false);
});
test("ДЕФЕКТ T-2: союз из трёх партнёров не должен терять людей в раскладке family", { todo: "family-layout.ts учитывает союзы только из 1–2 партнёров" }, () => {
  const people = [P("a", "m"), P("b", "f"), P("c", "f"), P("k")];
  const r = inspect(people, [U("u1", ["a", "b", "c"], ["k"])], "k", "family");
  assert.deepEqual(r.lost, []);
});
test("ДЕФЕКТ T-3: взаимный цикл «родитель ↔ ребёнок» должен давать предупреждение, а не молча строиться", { todo: "нет проверки циклов при сборке древа" }, () => {
  const d = treeFromPeople([R("me", "Я", { parents: ["c"] }), R("c", "Сын", { parents: ["me"] })]);
  assert.ok((d.ambiguous ?? []).length > 0);
});
test("ДЕФЕКТ T-4: второй «Жена» без moreSpouses не должна пропадать из связей молча", { todo: "from-people.ts: вторая запись «Жена» остаётся без союза («Родственник»)" }, () => {
  const d = treeFromPeople([R("me", "Я"), R("w1", "Жена"), R("w2", "Жена")]);
  assert.ok(d.unions.some((u) => u.partnerIds.includes("w2")) || (d.ambiguous ?? []).some((a) => a.id === "w2"));
});
test("ДЕФЕКТ T-5: бабушка/дедушка без записи родителя не должны оставаться без места в древе", { todo: "from-people.ts: роль grand привязывается только через существующего родителя" }, () => {
  const d = treeFromPeople([R("me", "Я"), R("g", "Бабушка")]);
  assert.ok(d.unions.some((u) => u.partnerIds.includes("g")));
});
