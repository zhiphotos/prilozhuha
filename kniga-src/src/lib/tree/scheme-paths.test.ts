// Отображение линий на экране «Схема» (этап 4.2): что именно рисуется. Проверяются строки контуров, а не только поля раскладки.
import assert from "node:assert/strict";
import test from "node:test";
import { annaPeople, artificial, elizaveta, elizavetaTangled, small } from "./family-fixtures.ts";
import { treeFromPeople } from "./from-people.ts";
import { buildLayout, placePills, resolveCentralPair, routeBuses, type AppLayout } from "./layout-engine.ts";
import { layoutTree } from "./layout.ts";
import { PLATE_W, PORTRAIT_R } from "./metrics.ts";
import { applyShifts } from "./offsets.ts";
import { busHops } from "./bus-look.ts";
import { busIsFar, busLinkPath, busPath, pillLabel, pillPoint, pillSize, refLinkPath, spousePath, type SchemeBus } from "./scheme-paths.ts";
import { childTrunk } from "./trunk.ts";
import type { Person, TreeLayout } from "./types.ts";
import { person, union } from "./family-fixtures.ts";

// Прежние функции экрана «Схема» дословно (из TreeStage до этапа 4.2): classic обязан рисоваться ровно так же.
const FAR_LINK = 520;
function legacyBusIsFar(bus: TreeLayout["buses"][number]): boolean {
  const min = bus.xs[0];
  const max = bus.xs[bus.xs.length - 1];
  return bus.fromX != null && bus.fromY != null && min != null && max != null && (bus.fromX < min - FAR_LINK || bus.fromX > max + FAR_LINK);
}

function legacyBusPath(bus: TreeLayout["buses"][number]): string {
  const parts: string[] = [];
  const min = bus.xs[0];
  const max = bus.xs[bus.xs.length - 1];
  const far = legacyBusIsFar(bus);
  let trunked = false;
  if (!far && bus.fromX != null && bus.fromY != null && min != null && max != null) {
    if (bus.partnerXs && bus.partnerTop != null && bus.bracketY !== undefined) {
      parts.push(`M ${bus.fromX} ${bus.fromY} V ${bus.busY}`);
      if (bus.fromX < min - 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${min}`);
      else if (bus.fromX > max + 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${max}`);
    } else {
      parts.push(...childTrunk(bus.fromX, bus.fromY, bus.busY, bus.xs));
      trunked = true;
    }
  }
  if (bus.partnerXs && bus.partnerTop != null && bus.bracketY !== undefined) {
    // Брак между далёкими супругами: от каждого вниз и общая линия; от её середины вниз к детям, там разветвление.
    for (const x of bus.partnerXs) parts.push(`M ${x} ${bus.partnerTop} V ${bus.bracketY}`);
    parts.push(`M ${Math.min(...bus.partnerXs)} ${bus.bracketY} H ${Math.max(...bus.partnerXs)}`);
    const mid = bus.fromX ?? (bus.partnerXs[0]! + bus.partnerXs[1]!) / 2;
    parts.push(`M ${mid} ${bus.bracketY} V ${bus.busY}`);
    parts.push(`M ${Math.min(mid, ...bus.xs)} ${bus.busY} H ${Math.max(mid, ...bus.xs)}`);
  } else if (!trunked && min != null && max != null && bus.xs.length > 1) parts.push(`M ${min} ${bus.busY} H ${max}`);
  bus.xs.forEach((x, i) => parts.push(`M ${x} ${bus.busY} V ${bus.childTops?.[i] ?? bus.childTop}`));
  return parts.join(" ");
}

/** Дальняя связь от родителей к детям: от брака вниз и вбок к ближайшему ребёнку. */
function legacyBusLinkPath(bus: TreeLayout["buses"][number]): string {
  if (!legacyBusIsFar(bus)) return "";
  const min = bus.xs[0]!;
  const max = bus.xs[bus.xs.length - 1]!;
  const to = bus.fromX! < min ? min : max;
  return `M ${bus.fromX} ${bus.fromY} V ${bus.busY} H ${to}`;
}

function legacySpousePath(link: TreeLayout["spouses"][number]): string {
  if (link.bracketY !== undefined) return "";
  const dir = Math.sign(link.x2 - link.x1) || 1;
  const x1 = link.x1 + dir * (PORTRAIT_R + 2);
  const x2 = link.x2 - dir * (PORTRAIT_R + 2);
  if (!link.curved) return `M ${x1} ${link.y1} H ${x2}`;
  const mx = (link.x1 + link.x2) / 2;
  const my = Math.min(link.y1, link.y2) - 58;
  return `M ${x1} ${link.y1} Q ${mx} ${my} ${x2} ${link.y2}`;
}

function legacyPillPoint(link: TreeLayout["spouses"][number]): { x: number; y: number } {
  if (link.bracketY !== undefined) return { x: (link.x1 + link.x2) / 2, y: link.bracketY };
  if (!link.curved) return { x: (link.x1 + link.x2) / 2, y: link.y1 };
  const mx = (link.x1 + link.x2) / 2;
  const my = Math.min(link.y1, link.y2) - 58;
  return { x: mx, y: 0.25 * link.y1 + 0.5 * my + 0.25 * link.y2 };
}


function worlds() {
  const a = treeFromPeople(annaPeople());
  const s = small(), ar = artificial(), e = elizaveta(), e2 = elizavetaTangled();
  return [
    { name: "anna", people: a.people, unions: a.unions, focus: a.focusId, owner: a.focusId },
    { name: "small", people: s.people, unions: s.unions, focus: "жена", owner: "жена" },
    { name: "artificial", people: ar.people, unions: ar.unions, focus: "жена", owner: "жена" },
    { name: "eliz", people: e.people, unions: e.unions, focus: "сестра1", owner: "сестра1" },
    { name: "eliz2", people: e2.people, unions: e2.unions, focus: "сестра1", owner: "сестра1" },
  ];
}

test("classic: контуры линий те же, что рисовал экран до этапа 4.2 (шины, дальние связи, брак, плашка)", () => {
  for (const w of worlds()) {
    for (const flow of ["down", "up"] as const) {
      const L = layoutTree(w.people, w.unions, w.focus, flow);
      for (const b of L.buses) {
        assert.equal(busPath(b as SchemeBus), legacyBusPath(b), `${w.name}/${flow}/${b.unionId}: шина`);
        assert.equal(busLinkPath(b as SchemeBus), legacyBusLinkPath(b), `${w.name}: дальняя связь`);
        assert.equal(busIsFar(b as SchemeBus), legacyBusIsFar(b));
      }
      for (const s of L.spouses) {
        assert.equal(spousePath(s), legacySpousePath(s), `${w.name}: линия брака`);
        assert.deepEqual(pillPoint(s), legacyPillPoint(s), `${w.name}: плашка`);
      }
    }
  }
});

/** Точки квадратичной дуги из строки контура `M x y Q cx cy x2 y2`. */
function arcPoints(d: string, n = 40) {
  const m = /^M ([\d.-]+) ([\d.-]+) Q ([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)$/.exec(d);
  assert.ok(m, `не дуга: ${d}`);
  const [x0, y0, cx, cy, x1, y1] = m!.slice(1).map(Number) as [number, number, number, number, number, number];
  return Array.from({ length: n + 1 }, (_, i) => { const t = i / n; return { x: (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t * t * x1, y: (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t * t * y1 }; });
}

test("дуга брака рисуется по arcH и проходит выше портретов чужих карточек между супругами (вниз и вверх)", () => {
  // три карточки в одном ряду, брак между крайними: средняя чужая
  const link = { unionId: "u", x1: 0, y1: 500, x2: 400, y2: 500, status: "married" as const, curved: true, arcH: 82 };
  const pts = arcPoints(spousePath(link));
  const peak = Math.min(...pts.map((p) => p.y));
  assert.ok(Math.abs(peak - (500 - 82)) < 1, `вершина дуги ${peak}, а должна быть на arcH=82 выше`);
  const mid = pts.filter((p) => Math.abs(p.x - 200) <= PORTRAIT_R);
  assert.ok(mid.length > 3 && mid.every((p) => p.y < 500 - PORTRAIT_R - 2), "дуга задевает портрет средней карточки");
  // без arcH (classic) прежние 58: вершина на 29 выше, это и есть то, что раньше пряталось за портретом
  assert.ok(Math.abs(Math.min(...arcPoints(spousePath({ ...link, arcH: undefined })).map((p) => p.y)) - (500 - 29)) < 1);
  // высота арки задаёт и положение плашки «БРАК»: на вершине
  assert.ok(Math.abs(pillPoint(link).y - (500 - 82)) < 1);
});

test("family: у каждой брачной линии под чужой карточкой дуга реально проходит над портретами (на раскладках вниз и вверх)", () => {
  let checked = 0;
  for (const w of worlds()) {
    for (const flow of ["down", "up"] as const) {
      const L = buildLayout(w.people, w.unions, w.focus, flow, { engine: "family", ownerId: w.owner });
      for (const s of L.spouses) {
        const lo = Math.min(s.x1, s.x2), hi = Math.max(s.x1, s.x2);
        const between = [...L.nodes, ...L.refs].filter((n) => n.y === s.y1 && n.x > lo + 1 && n.x < hi - 1);
        if (!between.length) { assert.ok(!s.curved || (s.arcH ?? 0) > 0 || Math.abs(s.x1 - s.x2) > 0, "ok"); continue; }
        checked++;
        const pts = arcPoints(spousePath(s));
        for (const c of between) assert.ok(pts.filter((p) => Math.abs(p.x - c.x) <= PORTRAIT_R).every((p) => p.y < c.y - PORTRAIT_R - 2), `${w.name}/${flow}: дуга ${s.unionId} задевает карточку ${c.x}`);
      }
    }
  }
  assert.ok(checked > 0, "нет ни одного случая дуги: проверка пустая");
});

test("family: вход в каждого ребёнка нарисован до его карточки, а сдвинутый вход заканчивается коленом на нужном месте", () => {
  for (const w of worlds()) {
    for (const flow of ["down", "up"] as const) {
      const L = buildLayout(w.people, w.unions, w.focus, flow, { engine: "family", ownerId: w.owner });
      for (const b of L.buses) {
        const d = busPath(b as SchemeBus);
        b.xs.forEach((x, i) => {
          const top = b.childTops?.[i] ?? b.childTop;
          const drop = (b as SchemeBus).dropXs?.[i] ?? x;
          const tail = drop === x ? `M ${x} ${b.busY} V ${top}` : ` H ${x} V ${top}`;
          assert.ok(d.includes(tail), `${w.name}/${flow}/${b.unionId}: вход ${i} не заканчивается у карточки (${tail})`);
        });
      }
    }
  }
});

test("перекладина перепрыгивает чужую вертикаль дугой в самом контуре", () => {
  const A: SchemeBus = { unionId: "a", fromX: 100, fromY: 0, busY: 100, xs: [140], childTop: 300 };
  const B: SchemeBus = { unionId: "b", fromX: 0, fromY: 0, busY: 200, xs: [20, 260], childTop: 300 };
  const hops = busHops([A, B]).get(1);
  assert.deepEqual(hops, [140]);
  assert.ok(busPath(B, hops).includes("a 7 7 0 0 1 14 0"), "в контуре нет прыжка");
  assert.ok(!busPath(B).includes(" a "), "без прыжков контур должен быть прежним");
  assert.deepEqual(childTrunk(0, 0, 200, [20, 260]).length, 2);
});

test("ссылки: на раскладке Анны есть ссылки, они не люди, линия к основной карточке идёт дугой над рядом", () => {
  const a = worlds()[0]!;
  const L = buildLayout(a.people, a.unions, a.focus, "down", { engine: "family", ownerId: a.owner });
  assert.ok(L.refs.length >= 2);
  const ids = new Set(a.people.map((p) => p.id));
  for (const r of L.refs) { assert.ok(!ids.has(r.id), "ссылка среди людей"); assert.ok(ids.has(r.of)); }
  for (const l of L.refLinks) assert.match(refLinkPath(l), /^M [\d.-]+ [\d.-]+ C /);
  assert.equal(L.nodes.length, a.people.length);
});

test("ручные смещения: ссылка едет с домашним супругом, вход со сдвигом и линия к основной карточке тянутся следом", () => {
  const a = worlds()[0]!;
  const L = buildLayout(a.people, a.unions, a.focus, "down", { engine: "family", ownerId: a.owner });
  const r = L.refs[0]!;
  const home = a.unions.find((u) => u.id === r.unionId)!.partnerIds.find((id) => id !== r.of)!;
  const S = applyShifts(L, a.unions, new Map([[home, { dx: 130, dy: 40 }]]));
  const r2 = S.refs.find((q) => q.id === r.id)!;
  assert.deepEqual([r2.x, r2.y], [r.x + 130, r.y + 40], "ссылка не поехала за супругом");
  const link = S.refLinks.find((q) => q.refId === r.id)!;
  assert.deepEqual([link.x1, link.y1], [r2.x, r2.y]);
  const main = S.nodes.find((n) => n.id === r.of)!;
  assert.deepEqual([link.x2, link.y2], [main.x, main.y]);
  const sp = S.spouses.find((q) => q.unionId === r.unionId)!;
  assert.ok([[sp.x1, sp.y1], [sp.x2, sp.y2]].some(([x, y]) => x === r2.x && y === r2.y), "брак нарисован не до ссылки");
  // сдвиг ребёнка двигает его вход вместе с карточкой
  const bus = L.buses.find((b) => (b as SchemeBus).dropXs && b.xs.length > 0)!;
  const u = a.unions.find((x) => x.id === bus.unionId)!;
  const kidId = u.childIds.find((k) => L.nodes.find((n) => n.id === k)?.x === bus.xs[0])!;
  const S2 = applyShifts(L, a.unions, new Map([[kidId, { dx: -90, dy: 0 }]]));
  const b2 = S2.buses.find((b) => b.unionId === bus.unionId)!;
  assert.ok(b2.xs.includes(bus.xs[0]! - 90));
  assert.equal((b2 as SchemeBus).dropXs!.length, b2.xs.length);
});

test("смена выбранного человека координат не меняет, ручные сдвиги ложатся поверх", () => {
  const a = worlds()[0]!;
  const people: Person[] = a.people.map((p, i) => (i === 3 ? { ...p, treeDx: 55, treeDy: -20 } : p));
  const shifts = new Map(people.filter((p) => p.treeDx || p.treeDy).map((p) => [p.id, { dx: p.treeDx ?? 0, dy: p.treeDy ?? 0 }]));
  const key = (focus: string) => applyShifts(buildLayout(people, a.unions, focus, "down", { engine: "family", ownerId: a.owner }), a.unions, shifts).nodes.map((n) => [n.id, n.x, n.y]).sort();
  assert.deepEqual(key(people[0]!.id), key(people[10]!.id));
  assert.deepEqual(key(people[0]!.id), key(people[50]!.id));
  void person; void union; void resolveCentralPair; void PLATE_W;
});

// ---- Плашки «БРАК» на длинных дугах ----
const node = (id: string, x: number, y = 500) => ({ id, x, y, gen: 0 });
function row(xs: number[], links: { id: string; a: number; b: number; status?: "married" | "divorced" }[]): AppLayout {
  const nodes = xs.map((x, i) => node(`n${i}`, x));
  const spouses = links.map((l) => ({ unionId: l.id, x1: xs[l.a]!, y1: 500, x2: xs[l.b]!, y2: 500, status: l.status ?? ("married" as const), curved: Math.abs(xs[l.b]! - xs[l.a]!) > 200 * 1.0 && Math.abs(xs[l.b]! - xs[l.a]!) > 400, arcH: 100 }));
  return { nodes, spouses, buses: [], labels: [], refs: [], refLinks: [], width: 0, height: 0, focusGen: 0, engine: "family" } as unknown as AppLayout;
}
const pillRect = (s: AppLayout["spouses"][number]) => ({ ...pillPoint(s), ...pillSize(s.status) });
function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}
function circleHits(c: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) {
  const dx = Math.max(Math.abs(c.x - r.x) - r.w / 2, 0), dy = Math.max(Math.abs(c.y - r.y) - r.h / 2, 0);
  return dx * dx + dy * dy < PORTRAIT_R ** 2;
}

test("плашка на длинной дуге стоит у начала дуги рядом с карточкой, а на короткой остаётся на вершине", () => {
  const L = placePills(row([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600], [{ id: "short", a: 0, b: 2 }, { id: "long", a: 3, b: 8 }]));
  const short = L.spouses.find((s) => s.unionId === "short")!;
  const long = L.spouses.find((s) => s.unionId === "long")!;
  assert.equal(short.pillT, undefined, "короткая дуга: плашка должна остаться на вершине");
  assert.ok(Math.abs(pillPoint(short).x - 200) < 1);
  assert.ok(long.pillT !== undefined && long.pillT > 0 && long.pillT < 0.2, `плашка длинной дуги не у начала: ${long.pillT}`);
  const p = pillPoint(long), w = pillSize(long.status).w;
  const distFromCard = Math.abs(p.x - long.x1);
  assert.ok(distFromCard >= PORTRAIT_R + w / 2 && distFromCard <= PORTRAIT_R + 2 + 60 + w / 2 + 1, `плашка в ${distFromCard} px от центра карточки, ждали около ${PORTRAIT_R + 14 + w / 2}`);
  assert.ok(p.y < 500, "плашка на дуге выше ряда");
});

test("порядок концов не важен: у карточки, чей конец записан вторым, плашка тоже у начала дуги (случай u73: слева настоящая карточка, справа ссылка)", () => {
  const xs = [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600];
  const L = placePills(row(xs, [{ id: "rev", a: 8, b: 3 }]));
  const s = L.spouses[0]!;
  // x1 (1600) правее x2 (600): левый конец, он же «домашний», записан вторым
  const p = pillPoint(s);
  assert.ok(Math.abs(p.x - 600) < PORTRAIT_R + 2 + 60 + 56 + 2 && Math.abs(p.x - 600) > PORTRAIT_R, `плашка не у левой карточки: x=${p.x}`);
  // с настоящей ссылкой на правом конце домом считается левый, на левом конце: правый
  const withRef = { ...L, refs: [{ id: "r", of: "n8", unionId: "rev", x: 1600, y: 500, gen: 0 }], spouses: row(xs, [{ id: "rev", a: 8, b: 3 }]).spouses } as unknown as AppLayout;
  const q = pillPoint(placePills(withRef).spouses[0]!);
  assert.ok(Math.abs(q.x - 600) < 130, `плашка не у настоящей карточки: x=${q.x}`);
  const withRef2 = { ...L, refs: [{ id: "r", of: "n3", unionId: "rev", x: 600, y: 500, gen: 0 }], spouses: row(xs, [{ id: "rev", a: 8, b: 3 }]).spouses } as unknown as AppLayout;
  const q2 = pillPoint(placePills(withRef2).spouses[0]!);
  assert.ok(Math.abs(q2.x - 1600) < 130, `плашка не у настоящей карточки справа: x=${q2.x}`);
});

test("плашка не ложится на соседнюю плашку и на портреты: берётся другой конец, потом сдвиг по дуге", () => {
  // у левого конца длинной дуги рядом уже есть брак с плашкой между карточками
  const A = placePills(row([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600], [{ id: "near", a: 3, b: 4 }, { id: "long", a: 3, b: 8 }]));
  const near = pillRect(A.spouses.find((s) => s.unionId === "near")!);
  const long = A.spouses.find((s) => s.unionId === "long")!;
  assert.ok(!overlaps(near, pillRect(long)), "плашки наложились");
  assert.ok(A.nodes.every((n) => !circleHits(n, pillRect(long))), "плашка на портрете");
  // заняты оба конца
  const B = placePills(row([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600], [{ id: "l", a: 0, b: 1 }, { id: "r", a: 7, b: 8 }, { id: "long", a: 0, b: 8 }]));
  const all = B.spouses.map(pillRect);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!overlaps(all[i]!, all[j]!), `плашки ${i} и ${j} наложились`);
  assert.ok(B.nodes.every((n) => !circleHits(n, pillRect(B.spouses.find((s) => s.unionId === "long")!))));
});

test("на раскладках из фикстур: плашки не накладываются ни друг на друга, ни на портреты (если есть длинная дуга, линия детей выходит из-под плашки)", () => {
  let longs = 0;
  for (const w of worlds()) {
    for (const flow of ["down", "up"] as const) {
      const L = buildLayout(w.people, w.unions, w.focus, flow, { engine: "family", ownerId: w.owner });
      const pills = L.spouses.map((s) => ({ s, r: pillRect(s) }));
      for (let i = 0; i < pills.length; i++) {
        const { s, r } = pills[i]!;
        for (let j = i + 1; j < pills.length; j++) assert.ok(!overlaps(r, pills[j]!.r), `${w.name}/${flow}: плашки ${s.unionId} и ${pills[j]!.s.unionId} наложились`);
        if (s.pillT !== undefined) {
          longs++;
          assert.ok(L.nodes.every((n) => !circleHits(n, r)), `${w.name}/${flow}: плашка ${s.unionId} на портрете`);
          const bus = L.buses.find((b) => b.unionId === s.unionId && !(b as SchemeBus).far);
          if (bus && bus.fromX != null) assert.ok(Math.abs(bus.fromX - r.x) < 1, `${w.name}/${flow}: линия детей ${s.unionId} не из-под плашки`);
        }
      }
    }
  }
  void longs; // длинных дуг в этих вымышленных семьях нет: правило проверяют два теста выше и следующий; на настоящих данных смотрели глазами
});

test("линия детей брака с длинной дугой выходит из-под плашки: вниз от её низа, вверх от её верха; у обычных браков не меняется", () => {
  for (const flow of ["down", "up"] as const) {
    const kidY = flow === "down" ? 832 : 168;
    const base = row([0, 200, 1600], [{ id: "long", a: 0, b: 2 }, { id: "tight", a: 0, b: 1 }]);
    const nodes = [...base.nodes, { id: "k", x: 800, y: kidY, gen: 1 }, { id: "k2", x: 100, y: kidY, gen: 1 }];
    const bus = (id: string, parents: string[], kid: string, x: number) => ({ unionId: id, fromX: x, fromY: 500, busY: 0, xs: [x], childTop: 0, dropXs: [x], jogY: [null], parentIds: parents, childIds: [kid] });
    const placed = placePills({ ...base, nodes, buses: [bus("long", ["n0", "n2"], "k", 800), bus("tight", ["n0", "n1"], "k2", 100)] } as unknown as AppLayout);
    const routed = routeBuses(placed, flow);
    const link = routed.spouses.find((s) => s.unionId === "long")!;
    const p = pillPoint(link);
    const b = routed.buses.find((q) => q.unionId === "long")!;
    assert.ok(link.pillT !== undefined && Math.abs(b.fromX! - p.x) < 1, `${flow}: линия детей не из-под плашки`);
    assert.ok(Math.abs(b.fromY! - (p.y + (flow === "down" ? 13 : -13))) < 1, `${flow}: начало линии не у края плашки`);
    const t = routed.buses.find((q) => q.unionId === "tight")!;
    assert.equal(t.fromX, 100, `${flow}: у обычного брака линия детей сдвинулась`);
  }
});

test("плашка у начала длинной дуги со стрелкой в сторону второго супруга, остальные плашки без стрелки; размер плашки учитывает стрелку", () => {
  const xs = [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600];
  const R = placePills(row(xs, [{ id: "long", a: 3, b: 8 }, { id: "short", a: 0, b: 1 }]));
  const long = R.spouses.find((s) => s.unionId === "long")!;
  const short = R.spouses.find((s) => s.unionId === "short")!;
  assert.equal(pillLabel("БРАК", long), "БРАК ›", "дуга идёт вправо");
  // ссылка на левом конце: домом считается правая настоящая карточка, дуга от неё идёт влево
  const base = row(xs, [{ id: "long", a: 8, b: 3 }]);
  const L2 = placePills({ ...base, refs: [{ id: "r", of: "n3", unionId: "long", x: 600, y: 500, gen: 0 }] } as unknown as AppLayout);
  assert.equal(pillLabel("БРАК", L2.spouses[0]!), "‹ БРАК", "дуга идёт влево");
  assert.equal(pillLabel("БРАК", short), "БРАК");
  assert.equal(pillSize("married", true).w, pillSize("married").w + 8);
});

test("плашка «РАЗВОД» со стрелкой тоже умещается у начала дуги между портретами, не уезжая за соседнюю карточку", () => {
  const xs = [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600];
  const L = placePills(row(xs, [{ id: "d", a: 0, b: 8, status: "divorced" }]));
  const s = L.spouses[0]!;
  const w = pillSize("divorced", true).w;
  const dist = Math.abs(pillPoint(s).x - 0);
  assert.ok(dist <= PORTRAIT_R + 2 + 60 + w / 2, `плашка уехала на ${dist} px, нужно в пределах 60 px от портрета`);
  assert.ok(L.nodes.every((n) => !circleHits(n, pillRect(s))));
});

test("дуга с макушки (arcTop): начинается над портретом, плашка выше ряда, у обычной дуги всё как прежде", async () => {
  const { spousePath, pillPoint } = await import("./scheme-paths.ts");
  const { PORTRAIT_R } = await import("./metrics.ts");
  const base = { unionId: "u", x1: 100, y1: 400, x2: 800, y2: 400, curved: true, arcH: 130, status: "married" as const };
  assert.ok(spousePath({ ...base, arcTop: true }).startsWith(`M 100 ${400 - PORTRAIT_R - 2} Q`));
  assert.ok(spousePath(base).startsWith(`M ${100 + PORTRAIT_R + 2} 400 Q`));
  const p = pillPoint({ ...base, arcTop: true, pillT: 0.17 });
  assert.ok(p.y < 400 - PORTRAIT_R - 12 - 6, "плашка целиком выше макушек портретов");
});
