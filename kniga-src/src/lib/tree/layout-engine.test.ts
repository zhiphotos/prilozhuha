// Этап 4.1: слой выбора раскладки. classic = прежний layoutTree, family = новая раскладка с центральной парой.
import assert from "node:assert/strict";
import test from "node:test";
import { annaPeople, artificial, elizaveta, small } from "./family-fixtures.ts";
import { layoutFamily } from "./family-layout.ts";
import { treeFromPeople } from "./from-people.ts";
import { PORTRAIT_R } from "./metrics.ts";
import { buildLayout, compareEngines, mirrorVertical, resolveCentralPair } from "./layout-engine.ts";
import { layoutTree } from "./layout.ts";
import { applyShifts, shiftsOf } from "./offsets.ts";
import type { Person, Union } from "./types.ts";

type Case = { name: string; people: Person[]; unions: Union[]; focus: string; owner: string; spouse?: string };
function cases(): Case[] {
  const a = treeFromPeople(annaPeople());
  const s = small(), ar = artificial(), e = elizaveta();
  return [
    { name: "anna", people: a.people, unions: a.unions, focus: a.focusId, owner: "iaxlcs3v", spouse: "mtg8vg3n" },
    { name: "small20", people: s.people, unions: s.unions, focus: "жена", owner: "жена" },
    { name: "artificial", people: ar.people, unions: ar.unions, focus: "жена", owner: "жена" },
    { name: "eliz", people: e.people, unions: e.unions, focus: "сестра1", owner: "сестра1" },
  ];
}
const strip = <T extends { refs?: unknown; refLinks?: unknown; engine?: unknown }>(L: T) => { const { refs: _r, refLinks: _l, engine: _e, ...rest } = L; return rest; };

test("classic: результат полностью совпадает со старым layoutTree (и по умолчанию движок classic)", () => {
  for (const c of cases()) for (const flow of ["down", "up"] as const) {
    const old = layoutTree(c.people, c.unions, c.focus, flow);
    const viaDefault = buildLayout(c.people, c.unions, c.focus, flow);
    const viaClassic = buildLayout(c.people, c.unions, c.focus, flow, { engine: "classic", ownerId: c.owner });
    assert.deepEqual(strip(viaDefault), old, `${c.name} ${flow}: по умолчанию не classic`);
    assert.deepEqual(strip(viaClassic), old, `${c.name} ${flow}`);
    assert.equal(viaDefault.engine, "classic");
    assert.equal(viaDefault.refs.length, 0);
  }
});

test("family: координаты новой раскладки; людей столько же, ссылок как в прототипе", () => {
  for (const c of cases()) {
    const L = buildLayout(c.people, c.unions, c.focus, "down", { engine: "family", ownerId: c.owner, spouseId: c.spouse });
    const F = layoutFamily(c.people, c.unions, { leftId: c.owner, rightId: c.spouse ?? resolveCentralPair(c.people, c.unions, c.owner).pair.rightId });
    assert.deepEqual(L.nodes, F.nodes, c.name);
    assert.equal(L.nodes.length, c.people.length, `${c.name}: потеря узлов`);
    assert.equal(L.refs.length, F.refs.length);
    assert.equal(L.engine, "family");
  }
});

test("family: смена focusId и порядка входных данных не меняет ни одной координаты", () => {
  for (const c of cases()) {
    const base = buildLayout(c.people, c.unions, c.focus, "down", { engine: "family", ownerId: c.owner, spouseId: c.spouse });
    for (const f of c.people.slice(0, 40).map((p) => p.id)) {
      const L = buildLayout(c.people, c.unions, f, "down", { engine: "family", ownerId: c.owner, spouseId: c.spouse });
      assert.deepEqual(L, base, `${c.name}: focusId ${f} сдвинул раскладку`);
    }
    const rev = buildLayout([...c.people].reverse(), [...c.unions].reverse(), c.focus, "down", { engine: "family", ownerId: c.owner, spouseId: c.spouse });
    assert.deepEqual(rev.nodes.map((n) => [n.id, n.x, n.y]).sort(), base.nodes.map((n) => [n.id, n.x, n.y]).sort(), `${c.name}: порядок данных`);
    assert.deepEqual(rev.refs.map((r) => [r.id, r.x]).sort(), base.refs.map((r) => [r.id, r.x]).sort());
  }
});

test("family без пары и владельца: понятная ошибка (focusId для центра не годится)", () => {
  const c = cases()[1]!;
  assert.throws(() => buildLayout(c.people, c.unions, c.focus, "down", { engine: "family" }), /центральная пара/);
});

test("центральная пара: один супруг, нет супруга, явная пара, пара из любого человека", () => {
  const e = elizaveta();
  const one = resolveCentralPair(e.people, e.unions, "брат1");
  assert.deepEqual(one, { pair: { leftId: "брат1", rightId: "сестра1" }, ambiguous: false, candidates: ["сестра1"] });
  const none = resolveCentralPair(e.people, e.unions, "прадед");
  assert.equal(none.pair.rightId, "прабаба"); // у прадеда один брак
  const solo = resolveCentralPair(e.people, e.unions, "сын1");
  assert.deepEqual(solo, { pair: { leftId: "сын1" }, ambiguous: false, candidates: [] });
  // явная пара главнее владельца; «Схема из выбранного»: пара от любого человека, исходные данные не меняются
  const before = JSON.stringify([e.people, e.unions]);
  const L = buildLayout(e.people, e.unions, "сестра1", "down", { engine: "family", ownerId: "брат1", pair: { leftId: "мама2", rightId: "папа2" } });
  assert.deepEqual(L.pair?.pair, { leftId: "мама2", rightId: "папа2" });
  assert.equal(JSON.stringify([e.people, e.unions]), before, "исходное дерево изменено");
  assert.equal(L.nodes.length, e.people.length);
});

test("несколько браков у владельца: супруг не выбирается молча", () => {
  const ar = artificial();
  const r = resolveCentralPair(ar.people, ar.unions, "дедО");
  assert.equal(r.ambiguous, true);
  assert.ok(r.candidates.length >= 2);
  assert.deepEqual(r.pair, { leftId: "дедО" }, "без выбора в центре один владелец");
  const chosen = resolveCentralPair(ar.people, ar.unions, "дедО", r.candidates[1]);
  assert.deepEqual(chosen.pair, { leftId: "дедО", rightId: r.candidates[1] });
  assert.equal(chosen.ambiguous, false);
  const bogus = resolveCentralPair(ar.people, ar.unions, "дедО", "кто-то-чужой");
  assert.equal(bogus.ambiguous, true, "чужой id не принимается");
  const L = buildLayout(ar.people, ar.unions, "дедО", "down", { engine: "family", ownerId: "дедО" });
  assert.equal(L.pair?.ambiguous, true, "слой сообщает неоднозначность наружу");
  assert.equal(L.nodes.length, ar.people.length);
});

test("flow up: вертикальное зеркало, x не меняются, дети над родителями, двойное зеркало даёт исходное", () => {
  for (const c of cases()) {
    const down = buildLayout(c.people, c.unions, c.focus, "down", { engine: "family", ownerId: c.owner, spouseId: c.spouse });
    const up = buildLayout(c.people, c.unions, c.focus, "up", { engine: "family", ownerId: c.owner, spouseId: c.spouse });
    assert.deepEqual(up.nodes.map((n) => [n.id, n.x]), down.nodes.map((n) => [n.id, n.x]), `${c.name}: x изменились`);
    const at = new Map(up.nodes.map((n) => [n.id, n]));
    for (const b of up.buses) {
      const u = c.unions.find((x) => x.id === b.unionId)!;
      const parent = u.partnerIds.map((p) => at.get(p)).find(Boolean);
      const kid = u.childIds.map((k) => at.get(k)).find(Boolean);
      if (parent && kid) assert.ok(kid.y < parent.y, `${c.name}/${b.unionId}: дети не над родителями`);
    }
    // карточки, брачные линии, ссылки и подписи отражаются обратимо; линии детей считаются заново под рисунок (см. следующий тест)
    const part = (L: typeof down) => ({ nodes: L.nodes, spouses: L.spouses, refs: L.refs, refLinks: L.refLinks, labels: L.labels });
    assert.deepEqual(part(mirrorVertical(up)), part(down), `${c.name}: зеркало не обратимо`);
    assert.equal(up.labels.length, down.labels.length);
  }
});

test("линии детей под рисунок экрана: вниз от родителей к верху портрета, вверх от верха родителей к низу подписи, перекладина между рядами", () => {
  for (const c of cases()) {
    for (const flow of ["down", "up"] as const) {
      const L = buildLayout(c.people, c.unions, c.focus, flow, { engine: "family", ownerId: c.owner, spouseId: c.spouse });
      const y = new Map(L.nodes.map((n) => [n.id, n.y]));
      for (const b of L.buses) {
        const u = c.unions.find((x) => x.id === b.unionId)!;
        const kid = u.childIds.map((k) => y.get(k)).find((v) => v !== undefined);
        if (kid === undefined || b.fromY == null) continue;
        const tag = `${c.name}/${flow}/${b.unionId}`;
        if (flow === "down") {
          assert.ok(b.fromY <= b.busY && b.busY < b.childTop, `${tag}: перекладина не между родителями и детьми`);
          assert.ok(b.childTop <= Math.max(...u.childIds.map((k) => y.get(k) ?? -Infinity)) - PORTRAIT_R + 0.5, `${tag}: вход ниже верха портрета`);
        } else {
          assert.ok(b.childTop < b.busY && b.busY <= b.fromY, `${tag}: перекладина не между детьми и родителями (вверх)`);
        }
      }
    }
  }
});

test("подписи поколений: по ряду на поколение, у центральной пары «Вы и ваши», выше «Родители»", () => {
  for (const c of cases()) {
    const L = buildLayout(c.people, c.unions, c.focus, "down", { engine: "family", ownerId: c.owner, spouseId: c.spouse });
    const gens = new Set(L.nodes.map((n) => n.gen));
    assert.equal(L.labels.length, gens.size, c.name);
    for (const l of L.labels) assert.ok(l.text && Number.isFinite(l.y));
    const centre = L.nodes.find((n) => n.id === c.owner)!;
    assert.equal(L.labels.find((l) => l.gen === centre.gen)!.text, "Вы и ваши");
    const parents = L.labels.find((l) => l.gen === centre.gen - 1);
    if (parents) assert.equal(parents.text, "Родители");
  }
});

test("ручные настройки: rank и side действуют в family, treeDx/treeDy ложатся поверх (applyShifts), раскладку не меняют", () => {
  const s = small();
  const opts = { engine: "family" as const, ownerId: "жена" };
  const base = buildLayout(s.people, s.unions, "жена", "down", opts);
  const xOf = (L: typeof base, id: string) => L.nodes.find((n) => n.id === id)!.x;
  // rank: меняем порядок двух двоюродных (у собственных братьев центральной пары порядок диктует сторона крыла)
  const u = s.unions.find((x) => x.partnerIds.includes("дядя") && x.childIds.length >= 2)!; // дети дяди: порядок ветки не задан геометрией центра
  const [k1, k2] = u.childIds as [string, string];
  const r1 = buildLayout(s.people.map((p) => (p.id === k1 ? { ...p, rank: 0 } : p.id === k2 ? { ...p, rank: 1 } : p)), s.unions, "жена", "down", opts);
  const r2 = buildLayout(s.people.map((p) => (p.id === k1 ? { ...p, rank: 1 } : p.id === k2 ? { ...p, rank: 0 } : p)), s.unions, "жена", "down", opts);
  assert.ok(xOf(r1, k1) < xOf(r1, k2) && xOf(r2, k1) > xOf(r2, k2), "rank не меняет порядок");
  // side: сторона супруга
  const [pa, pb] = ["отец", "мать"]; // родители центральной пары: сторона супруга
  const sa = buildLayout(s.people.map((p) => (p.id === pa ? { ...p, side: "left" as const } : p.id === pb ? { ...p, side: "right" as const } : p)), s.unions, "жена", "down", opts);
  const sb = buildLayout(s.people.map((p) => (p.id === pa ? { ...p, side: "right" as const } : p.id === pb ? { ...p, side: "left" as const } : p)), s.unions, "жена", "down", opts);
  assert.ok(xOf(sa, pa) < xOf(sa, pb) && xOf(sb, pa) > xOf(sb, pb), "side не меняет сторону");
  // treeDx/treeDy: раскладка их не читает, сдвиг делает прежний applyShifts
  const withShift = s.people.map((p) => (p.id === "брат" ? { ...p, treeDx: 37, treeDy: -11 } : p));
  const same = buildLayout(withShift, s.unions, "жена", "down", opts);
  assert.deepEqual(same.nodes, base.nodes, "раскладка не должна читать treeDx/treeDy");
  const shifted = applyShifts(same, s.unions, shiftsOf(withShift));
  for (const n of shifted.nodes) {
    const o = base.nodes.find((q) => q.id === n.id)!;
    if (n.id === "брат") assert.deepEqual([n.x, n.y], [o.x + 37, o.y - 11]);
    else assert.deepEqual([n.x, n.y], [o.x, o.y], `${n.id} сдвинулся`);
  }
  assert.equal(shifted.nodes.length, base.nodes.length);
});

test("compareEngines на Анне: ничего не потеряно, оба движка дают 288 человек", () => {
  const c = cases()[0]!;
  const r = compareEngines(c.people, c.unions, c.focus, c.owner);
  assert.equal(r.classic.nodes, 288);
  assert.equal(r.family.nodes, 288);
  assert.equal(r.family.refs, 2);
  console.log("COMPARE_ANNA", JSON.stringify(r));
});
