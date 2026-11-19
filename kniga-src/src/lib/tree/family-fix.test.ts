// Этап 3.2: линии детей не должны ложиться на чужие вертикали. Координаты карточек не меняются.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { layoutFamily } from "./family-layout.ts";
import { annaPeople, artificial, elizaveta, elizavetaTangled, small } from "./family-fixtures.ts";

// Снимок координат этапа 3.2 (только id карточек и числа; у Анны id обезличены) лежит рядом, в fixtures.
const SNAP = fileURLToPath(new URL("./fixtures/family-coords-3-2.txt", import.meta.url));

async function cases() {
  const { treeFromPeople } = await import("./from-people.ts");
  const a = treeFromPeople(annaPeople());
  const s = small();
  const ar = artificial();
  const e = elizaveta(), e2 = elizavetaTangled();
  return {
    anna: layoutFamily(a.people, a.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" }),
    small20: layoutFamily(s.people, s.unions, { leftId: "жена", rightId: "муж" }),
    artificial: layoutFamily(ar.people, ar.unions, { leftId: "жена", rightId: "муж" }),
    eliz: layoutFamily(e.people, e.unions, { leftId: "сестра1", rightId: "брат1" }),
    eliz2: layoutFamily(e2.people, e2.unions, { leftId: "сестра1", rightId: "брат1" }),
  };
}

/** Подпись основного дерева: карточки, ссылки и шины без высоты полосы (busY) и без шин далёких связей: их появление может сдвинуть полосы соседей, но не карточки. */
const sig = (L: Awaited<ReturnType<typeof cases>>[keyof Awaited<ReturnType<typeof cases>>]) => {
  const outside = new Set([...L.blocks.flat(), ...L.singles]);
  return {
    refs: L.refs.length,
    nodes: L.nodes.filter((n) => !outside.has(n.id)).map((n) => [n.id, n.x, n.y]).sort(),
    refCards: L.refs.map((r) => [r.id, r.x, r.y]).sort(),
    buses: L.buses.filter((b) => !b.far).map((b) => [b.unionId, b.fromX, b.fromY, b.xs, b.childTop]).sort(),
    busesFull: L.buses.filter((b) => !b.far).map((b) => [b.unionId, b.fromX, b.fromY, b.busY, b.xs, b.childTop]).sort(),
  };
};

test("входы линий лежат в пределах своей карточки, а дуга над чужой карточкой отмечена", async () => {
  const all = await cases();
  for (const [k, L] of Object.entries(all)) {
    for (const b of L.buses) b.xs.forEach((x, i) => assert.ok(Math.abs(b.dropXs[i]! - x) <= PLATE_W / 2, `${k}: вход вне карточки`));
    for (const s of L.spouses) {
      const lo = Math.min(s.x1, s.x2), hi = Math.max(s.x1, s.x2);
      const covered = [...L.nodes, ...L.refs].some((n) => n.y === s.y1 && n.x > lo + 1 && n.x < hi - 1);
      assert.ok(!covered || (s.curved && (s.arcH ?? 0) > PLATE_H / 2), `${k}: прямая линия ${s.unionId} под чужой карточкой`);
    }
  }
});

test("координаты карточек основного дерева, ссылки и шины (кроме входов и высоты полос) не изменились", async () => {
  const all = await cases();
  const now = Object.fromEntries(Object.entries(all).map(([k, L]) => [k, sig(L)]));
  const old = JSON.parse(readFileSync(SNAP, "utf8")) as Record<string, { refs: number; nodes: [string, number, number][]; refCards: unknown; buses: unknown[][] }>;
  for (const [k, o] of Object.entries(old)) {
    const mine = JSON.parse(JSON.stringify(now[k]));
    const keep = new Set(mine.nodes.map((n: [string]) => n[0]));
    // в прежнем снимке одиночки Анны стояли в общем ряду; сравниваем только тех, кто остался в основном дереве
    assert.deepEqual(mine.nodes, o.nodes.filter((n) => keep.has(n[0])), `${k}: карточки`);
    assert.equal(mine.nodes.length >= o.nodes.length - 1, true, `${k}: потеряны люди`);
    assert.deepEqual(mine.refCards, o.refCards, `${k}: ссылки`);
    // шины: без далёких связей высоты полос должны совпасть полностью; у Анны одна далёкая шина делит полосы с соседями, поэтому там высоту полосы не сравниваем
    const hasFar = all[k as keyof typeof all].buses.some((b) => b.far);
    const strip = (b: unknown[]) => (hasFar ? [b[0], b[1], b[2], b[4], b[5]] : b);
    assert.deepEqual(hasFar ? mine.buses : mine.busesFull, hasFar ? o.buses.map(strip).sort() : o.buses.sort(), `${k}: шины`);
  }
});

import { PLATE_H, PLATE_W } from "./metrics.ts";

/** Вертикали разных семей, лежащие друг на друге (по x в пределах 8 и общему отрезку по y). */
export function overlaps(L: Awaited<ReturnType<typeof cases>>[keyof Awaited<ReturnType<typeof cases>>]) {
  type Seg = { x: number; y1: number; y2: number; u: string; kind: string };
  const segs: Seg[] = [];
  for (const b of L.buses) {
    if (b.fromX != null && b.fromY != null) segs.push({ x: b.fromX, y1: b.fromY, y2: b.busY, u: b.unionId, kind: "стебель" });
    b.dropXs.forEach((x, i) => {
      const j = b.jogY[i];
      segs.push({ x, y1: b.busY, y2: j ?? b.childTop, u: b.unionId, kind: "спуск" });
      if (j != null) segs.push({ x: b.xs[i]!, y1: j, y2: b.childTop, u: b.unionId, kind: "спуск" });
    });
  }
  let n = 0;
  for (let i = 0; i < segs.length; i++) for (let k = i + 1; k < segs.length; k++) {
    const a = segs[i]!, b = segs[k]!;
    if (a.u !== b.u && Math.abs(a.x - b.x) < 8 && Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1) > 1) n++;
  }
  return n;
}

test("вертикали разных семей больше не лежат друг на друге, входы остаются в пределах карточки", async () => {
  const all = await cases();
  const report: Record<string, unknown> = {};
  for (const [k, L] of Object.entries(all)) {
    const o = overlaps(L);
    const shifted = L.buses.reduce((t, b) => t + b.dropXs.filter((x, i) => x !== b.xs[i]).length, 0);
    const jogs = L.buses.reduce((t, b) => t + b.jogY.filter((j) => j != null).length, 0);
    report[k] = { overlaps: o, shifted, jogs };
    assert.equal(o, 0, `${k}: наложений ${o}`);
    for (const b of L.buses) b.dropXs.forEach((x, i) => { if (b.jogY[i] == null) assert.ok(Math.abs(x - b.xs[i]!) <= PLATE_W / 2 - 4, "вход вне карточки"); });
  }
  console.log("DROPS", JSON.stringify(report));
});

test("Елизавета: зелёный спуск к сестре1 не лежит на красном стебле отцаБ и матиБ", async () => {
  const all = await cases();
  for (const L of [all.eliz, all.eliz2]) {
    const green = L.buses.find((b) => b.unionId === "род_с1")!;
    const red = L.buses.find((b) => b.unionId === "род_братьев")!;
    const i = green.xs.length - 1; // единственный ребёнок: сестра1
    assert.ok(Math.abs(green.dropXs[i]! - red.fromX!) >= 8, "спуск совпал со стеблем");
    assert.equal(green.xs[i], L.nodes.find((n) => n.id === "сестра1")!.x, "карточка сестры1 на месте");
  }
});
