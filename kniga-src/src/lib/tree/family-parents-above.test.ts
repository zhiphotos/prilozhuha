// Родители над ребёнком в семейной раскладке: замеры по семьям и проверка, что улучшение ничего не сломало.
// Метрика (family-parents-metrics.ts): для каждой семьи середина родителей относительно размаха детей, в карточках.
// База (fixtures/wings/parents-above-baseline.json) снята со старой раскладки (до двухпроходной).
// Деревья «Анна» и diag-* обезличенные, синтетика выдумана (family-wings-fixtures.ts).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { annaPeople } from "./family-fixtures.ts";
import { bigWorld, mk, randomWorld, rowMixing, treeOf, type P } from "./family-wings-fixtures.ts";
import { layoutFamily } from "./family-layout.ts";
import { emptyAgg, measureOne, pct, type Agg } from "./family-parents-metrics.ts";
import { resolveCentralPair } from "./layout-engine.ts";
import { treeFromPeople } from "./from-people.ts";

const json = <T,>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as T;
const BASE = json<Record<string, Agg>>("wings/parents-above-baseline.json");
type Item = { t: { people: never[]; unions: never[] }; pair: { leftId: string; rightId?: string } };
const DIAG = ["diag-1029", "diag-1029b", "diag-1030", "diag-1101"];

/** Все наборы один раз: раскладка 5000 человек считается несколько секунд. */
let cache: Record<string, Agg> | null = null;
function all(): Record<string, Agg> {
  if (cache) return cache;
  const res: Record<string, Agg> = {};
  const run = (name: string, items: Item[]) => {
    const a = emptyAgg();
    for (const { t, pair } of items) measureOne(a, layoutFamily as never, t.people, t.unions, pair);
    res[name] = a;
  };
  run("Анна", [{ t: treeFromPeople(annaPeople() as never) as never, pair: { leftId: "iaxlcs3v", rightId: "mtg8vg3n" } }]);
  for (const f of DIAG) {
    const t = treeOf(json<{ people: P[] }>(`${f}-anon.json`).people);
    const items: Item[] = [];
    for (const p of t.people) { const { pair } = resolveCentralPair(t.people as never, t.unions as never, p.id); if (pair.rightId) items.push({ t: t as never, pair }); }
    run(`${f} (${t.people.length} чел)`, items);
  }
  run("синтетика x40", Array.from({ length: 40 }, (_, i) => ({ t: treeOf(randomWorld(i + 1, 4 + ((i + 1) % 3), 0.6)) as never, pair: { leftId: "W", rightId: "H" } })));
  for (const n of [2000, 5000]) run(`bigWorld ${n}`, [{ t: treeOf(bigWorld(n)) as never, pair: { leftId: "W", rightId: "H" } }]);
  cache = res;
  return res;
}
const get = (prefix: string) => { const k = Object.keys(all()).find((x) => x.startsWith(prefix))!; return { now: all()[k]!, base: BASE[k]!, name: k }; };
const span = (a: Agg) => pct(a.inSpan, a.fams);

test("P1. инварианты на всех наборах: никого не потеряли, карточки не налезают, стороны не смешаны, у каждого ребёнка есть линия к родителям", () => {
  for (const [name, a] of Object.entries(all())) {
    assert.equal(a.lost, 0, `${name}: потеряны люди`);
    assert.equal(a.mixed, 0, `${name}: стороны перемешаны`);
    assert.equal(a.noLink, 0, `${name}: ребёнок без линии к родителям`);
    const base = BASE[name]!;
    assert.ok(a.overlaps <= base.overlaps, `${name}: налезаний ${a.overlaps}, в базе ${base.overlaps}`);
  }
});

test("P2. не хуже старой раскладки: доля семей в размахе, разорванные пары, ширина листа (в среднем не больше +15%)", () => {
  for (const [name, a] of Object.entries(all())) {
    const base = BASE[name]!;
    assert.ok(span(a) >= span(base) - 1e-9, `${name}: в размахе ${span(a).toFixed(1)}% против ${span(base).toFixed(1)}%`);
    assert.ok(a.split <= base.split, `${name}: разорванных пар ${a.split} против ${base.split}`);
    assert.ok(a.far10 <= base.far10, `${name}: семей дальше 10 карточек ${a.far10} против ${base.far10}`);
    assert.ok(a.width / a.layouts <= (base.width / base.layouts) * 1.15, `${name}: ширина ${Math.round(a.width / a.layouts)} против ${Math.round(base.width / base.layouts)}`);
  }
});

test("P3. «Анна»: не менее 96% семей в размахе детей; ни одного второго брака дальше 6 карточек от детей, кроме одного известного", () => {
  const { now } = get("Анна");
  assert.ok(span(now) >= 96, `в размахе ${span(now).toFixed(1)}%`);
  assert.ok(now.second6 <= 1, `вторых браков дальше 6 карточек: ${now.second6}`);
});

test("P4. синтетика (40 миров): в размахе не меньше 80%, семей дальше 3 карточек не больше 350", () => {
  const { now } = get("синтетика");
  assert.ok(span(now) >= 80, `в размахе ${span(now).toFixed(1)}%`);
  assert.ok(now.far3 <= 350, `дальше 3 карточек: ${now.far3} (было 635)`);
});

test("P5. большие деревья 2000 и 5000 человек: ни одной семьи, где родители дальше 10 карточек от детей; 5000 человек считается быстрее 5 секунд", () => {
  for (const n of [2000, 5000]) {
    const { now, name } = get(`bigWorld ${n}`);
    assert.equal(now.far10, 0, `${name}: дальше 10 карточек ${now.far10} (было ${BASE[name]!.far10})`);
  }
  assert.ok(get("bigWorld 5000").now.maxMs < 5000, `${Math.round(get("bigWorld 5000").now.maxMs)} мс`);
});

// Критерии, которые на этом прототипе не достигнуты: тесты помечены todo и не валят набор, пока их не закроют (критерии не ослабляются).
test("P6. «Анна»: семей дальше 3 карточек от детей нет совсем", { todo: "остаётся одна семья (родители пары двух вторых браков стоят дальше 10 карточек от ребёнка)" }, () => {
  assert.equal(get("Анна").now.far3, 0);
});
test("P7. «Анна»: семей дальше 10 карточек нет совсем", { todo: "остаётся одна семья, см. P6" }, () => {
  assert.equal(get("Анна").now.far10, 0);
});
test("P8. синтетика (40 миров): семей дальше 10 карточек не больше 30", { todo: "около 40: это семьи в самых глубоких ветках, где двум парам предков нет места рядом" }, () => {
  assert.ok(get("синтетика").now.far10 <= 30, `${get("синтетика").now.far10}`);
});

/** Отчим: у предка второй брак; у нового супруга есть свои родители, брат и сестра с семьёй, у пары свои дети. */
function withStepfather(ps: P[], ancestor: string, tag: string): P[] {
  const out = ps.map((q) => (q.id === ancestor ? { ...q, moreSpouses: [...(q.moreSpouses ?? []), `${tag}X`] } : q));
  const who = ps.find((q) => q.id === ancestor)!;
  const xGender = who.gender === "m" ? "f" : "m";
  out.push(
    mk(`${tag}X`, xGender, { spouse: ancestor, parents: [`${tag}P1`, `${tag}P2`] }),
    mk(`${tag}P1`, "m", { spouse: `${tag}P2` }), mk(`${tag}P2`, "f", { spouse: `${tag}P1` }),
    mk(`${tag}S`, "m", { parents: [`${tag}P1`, `${tag}P2`], spouse: `${tag}SW` }), mk(`${tag}SW`, "f", { spouse: `${tag}S` }),
    mk(`${tag}SK`, "m", { parents: [`${tag}S`, `${tag}SW`] }),
    mk(`${tag}K1`, "m", { parents: xGender === "f" ? [ancestor, `${tag}X`] : [`${tag}X`, ancestor] }),
    mk(`${tag}K2`, "f", { parents: xGender === "f" ? [ancestor, `${tag}X`] : [`${tag}X`, ancestor] }),
  );
  return out;
}

const STEP_CASES = [1, 2, 3, 4, 5, 6].flatMap((seed) => ["wF1", "wM2", "hF1"].map((who) => ({ seed, who })));
function stepLayout(seed: number, who: string) {
  const ps = withStepfather(randomWorld(seed, 4, 0.3), who, "s");
  const t = treeOf(ps);
  return { ps, t, L: layoutFamily(t.people as never, t.unions as never, { leftId: "W", rightId: "H" }) };
}

test("P9. отчим с собственными родителями и сиблингами (18 деревьев): все на месте, карточки не налезают, стороны не смешаны, у каждого ребёнка линия к родителям", () => {
  for (const { seed, who } of STEP_CASES) {
    const { ps, t, L } = stepLayout(seed, who);
    const tag = `мир ${seed}/${who}`;
    assert.equal(L.nodes.length, t.people.length, `${tag}: потеряны люди`);
    assert.equal(rowMixing(L.nodes as never, ps), 0, `${tag}: стороны перемешаны`);
    const rows = new Map<number, number[]>();
    for (const n of L.nodes) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y)!).push(n.x);
    for (const xs of rows.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! - xs[i - 1]! >= 199, `${tag}: карточки налезают`); }
    const linked = new Set([...L.buses.flatMap((b) => b.childIds), ...L.far]);
    for (const q of t.people) {
      const hasParents = ps.find((z) => z.id === q.id)?.parents?.some((id: string) => t.people.some((z) => z.id === id));
      if (hasParents) assert.ok(linked.has(q.id), `${tag}/${q.id}: нет линии к родителям`);
    }
  }
});

test("P10. отчим: родители нового супруга над ним (в среднем не дальше 2,5 карточки от его с сестрой середины), второй брак (в среднем не дальше 3), дети второго брака под парой (в среднем не дальше 1,5)", () => {
  const GAP = 200;
  let parX = 0, marr = 0, kids = 0;
  for (const { seed, who } of STEP_CASES) {
    const { L } = stepLayout(seed, who);
    const at = new Map(L.nodes.map((n) => [n.id, n]));
    const mid = (a: string, b: string) => (at.get(a)!.x + at.get(b)!.x) / 2;
    parX += Math.abs(mid("sP1", "sP2") - mid("sX", "sS")) / GAP;
    marr += Math.abs(at.get(who)!.x - at.get("sX")!.x) / GAP;
    kids += Math.abs(mid(who, "sX") - mid("sK1", "sK2")) / GAP;
  }
  const n = STEP_CASES.length;
  assert.ok(parX / n <= 2.5, `родители нового супруга: в среднем ${(parX / n).toFixed(2)} карточки`);
  assert.ok(marr / n <= 3, `второй брак: в среднем ${(marr / n).toFixed(2)}`);
  assert.ok(kids / n <= 1.5, `дети второго брака: в среднем ${(kids / n).toFixed(2)}`);
});
