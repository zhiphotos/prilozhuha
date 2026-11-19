// Этап 1 ТЗ «пара рядом»: прототип раскладки на древе Анны (288 человек).
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { annaPeople, sides, wingStats } from "./family-fixtures.ts";
import { layoutFamily } from "./family-layout.ts";
import { treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";
import { PLATE_H, PLATE_W, H_GAP } from "./metrics.ts";

const ME = "iaxlcs3v";
const HUSBAND = "mtg8vg3n";
const GAP = PLATE_W + H_GAP;

function run() {
  const data = treeFromPeople(annaPeople());
  return { data, layout: layoutFamily(data.people, data.unions, { leftId: ME, rightId: HUSBAND }) };
}

test("прототип: Анна и муж рядом, все люди размещены", () => {
  const { data, layout } = run();
  const at = new Map(layout.nodes.map((n) => [n.id, n]));
  const dist = Math.abs(at.get(ME)!.x - at.get(HUSBAND)!.x);
  const stats = wingStats(layout, sides(data, ME, HUSBAND));
  console.log("proto", JSON.stringify({ dist, gap: GAP, layoutWidth: Math.round(layout.width), nodes: layout.nodes.length, unreached: layout.unreached.length, detached: layout.detached.length, ...stats }));
  assert.equal(layout.nodes.length, data.people.length, "все люди размещены");
  const outside = new Set([...layout.blocks.flat(), ...layout.singles]);
  assert.ok(layout.unreached.every((id) => outside.has(id)), `вне основного дерева, но и не в блоке или сетке: ${layout.unreached.join(",")}`);
  assert.ok(dist <= 2 * GAP, `пара рядом: ${dist}`);
});

test("прототип: раскладка не зависит от порядка входных данных", () => {
  const data = treeFromPeople(annaPeople());
  const a = layoutFamily(data.people, data.unions, { leftId: ME, rightId: HUSBAND });
  const b = layoutFamily([...data.people].reverse(), [...data.unions].reverse(), { leftId: ME, rightId: HUSBAND });
  const bx = new Map(b.nodes.map((n) => [n.id, n.x]));
  const diff = a.nodes.filter((n) => Math.abs(n.x - (bx.get(n.id) ?? NaN)) > 0.5).length;
  console.log("order-diff", diff);
  assert.equal(diff, 0);
});

test("прототип: сравнение со старой раскладкой при смене «от кого смотрим»", () => {
  const data = treeFromPeople(annaPeople());
  const old = (focus: string) => new Map(layoutTree(data.people, data.unions, focus).nodes.map((n) => [n.id, n.x]));
  const base = old(ME);
  const rows: Record<string, number> = {};
  for (const f of [HUSBAND, "iyrr5ih1", "el0dfrwd"]) {
    const m = old(f);
    rows[f] = [...base].filter(([id, x]) => Math.abs(x - (m.get(id) ?? 0)) > 1).length;
  }
  console.log("old-focus-change (сколько карточек сдвинулось относительно «от Анны»)", JSON.stringify(rows));
  const a = layoutFamily(data.people, data.unions, { leftId: ME, rightId: HUSBAND });
  assert.ok(a.nodes.length > 0);
});

test("render", () => {
  const { layout } = run();
  const data = treeFromPeople(annaPeople());
  const sd = sides(data, ME, HUSBAND);
  const L = layout;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}"><rect width="100%" height="100%" fill="#fff"/>`;
  L.buses.forEach((b, bi) => { s += `<g stroke="hsl(${(bi * 47) % 360} 70% 40%)" stroke-width="5" fill="none">`; if (b.fromX != null) s += `<path d="M${b.fromX} ${b.fromY}V${b.busY}"/>`; const mn = Math.min(...b.xs, b.fromX ?? 1e9), mx = Math.max(...b.xs, b.fromX ?? -1e9); s += `<path d="M${mn} ${b.busY}H${mx}"/>`; for (const x of b.xs) s += `<path d="M${x} ${b.busY}V${b.childTop}"/>`; s += `</g>`; });
  for (const sp of L.spouses) s += `<path d="M${sp.x1} ${sp.y1}L${sp.x2} ${sp.y2}" stroke="#d33" stroke-width="5"/>`;
  const det = new Set(L.detached);
  for (const n of L.nodes) { const c = n.id === ME || n.id === HUSBAND ? "#000" : sd.get(n.id) === "W" ? "#2e7d32" : sd.get(n.id) === "H" ? "#c2185b" : "#999"; s += `<rect x="${n.x - PLATE_W / 2}" y="${n.y - PLATE_H / 2}" width="${PLATE_W}" height="${PLATE_H}" rx="14" fill="${c}"${det.has(n.id) ? ' stroke="#00f" stroke-width="8"' : ""}/>`; }
  s += `</svg>`;
  writeFileSync(process.env.OUT ?? `${tmpdir()}/proto.svg`, s);
});
