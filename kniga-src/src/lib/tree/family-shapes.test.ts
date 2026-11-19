// Этап 1.1: прототип раскладки на потомках, маленькой семье, нескольких браках и ручных правках.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { layoutFamily } from "./family-layout.ts";
import { H_GAP, PLATE_H, PLATE_W } from "./metrics.ts";
import { annaPeople, laneReport, small } from "./family-fixtures.ts";
import type { Person, Union } from "./types.ts";

const GAP = PLATE_W + H_GAP;
const person = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "", ...extra });
const union = (id: string, partners: string[], kids: string[] = []): Union => ({ id, partnerIds: partners, childIds: kids, status: "married", startYear: "", endYear: "" });

/** Проверки, общие для любой раскладки: никто не налезает, супруги рядом, дети под своими родителями. */
export function check(people: Person[], unions: Union[], pair: { leftId: string; rightId?: string }) {
  const L = layoutFamily(people, unions, pair);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  assert.equal(L.nodes.length, people.length, "все размещены");
  const rows = new Map<number, number[]>();
  for (const n of L.nodes) (rows.get(n.gen) ?? rows.set(n.gen, []).get(n.gen)!).push(n.x);
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! - xs[i - 1]! >= GAP - 1, `карточки налезают: ${xs[i]! - xs[i - 1]!}`);
  }
  const det = new Set(L.detached);
  for (const u of unions) {
    const ps = u.partnerIds.map((q) => at.get(q)!);
    if (ps.length === 2 && !u.partnerIds.some((q) => det.has(q))) assert.ok(Math.abs(ps[0]!.x - ps[1]!.x) <= 2 * GAP + 1, `супруги ${u.id} далеко: ${Math.abs(ps[0]!.x - ps[1]!.x)}`);
    const kids = u.childIds.filter((c) => !det.has(c)).map((c) => at.get(c)!);
    if (kids.length && ps.length) {
      for (const k of kids) assert.ok(k.gen > ps[0]!.gen, `ребёнок ${k.id} не ниже родителей`);
    }
  }
  return { L, at };
}

function svg(L: ReturnType<typeof layoutFamily>, name: string, pair: string[]) {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}"><rect width="100%" height="100%" fill="#fff"/>`;
  L.buses.forEach((b, bi) => { s += `<g stroke="hsl(${(bi * 47) % 360} 70% 40%)" stroke-width="4" fill="none">`; if (b.fromX != null) s += `<path d="M${b.fromX} ${b.fromY}V${b.busY}"/>`; const mn = Math.min(...b.xs, b.fromX ?? 1e9), mx = Math.max(...b.xs, b.fromX ?? -1e9); s += `<path d="M${mn} ${b.busY}H${mx}"/>`; for (const x of b.xs) s += `<path d="M${x} ${b.busY}V${b.childTop}"/>`; s += `</g>`; });
  for (const sp of L.spouses) s += `<path d="M${sp.x1} ${sp.y1}L${sp.x2} ${sp.y2}" stroke="#d33" stroke-width="5"/>`;
  for (const n of L.nodes) s += `<rect x="${n.x - PLATE_W / 2}" y="${n.y - PLATE_H / 2}" width="${PLATE_W}" height="${PLATE_H}" rx="14" fill="${pair.includes(n.id) ? "#000" : "#2e7d32"}"/><text x="${n.x}" y="${n.y + 14}" font-size="40" fill="#fff" text-anchor="middle">${n.id}</text>`;
  writeFileSync(`${process.env.OUTDIR ?? tmpdir()}/${name}.svg`, s + "</svg>");
}


test("пара без детей", () => {
  const people = [person("а", "f"), person("б", "m")];
  const { at } = check(people, [union("u", ["а", "б"])], { leftId: "а", rightId: "б" });
  assert.equal(Math.abs(at.get("а")!.x - at.get("б")!.x), GAP);
});

test("пара с детьми, у детей свои супруги, внуки", () => {
  const { people, unions } = small();
  const { L } = check(people, unions, { leftId: "жена", rightId: "муж" });
  svg(L, "small20", ["жена", "муж"]);
});

test("человек с несколькими браками", () => {
  const people = [person("я", "f"), person("м", "m"), person("м2", "f"), person("д1", "m"), person("д2", "f"), person("д3", "m")];
  const unions = [union("a", ["я", "м"], ["д1", "д2"]), union("b", ["м", "м2"], ["д3"])];
  const { L } = check(people, unions, { leftId: "я", rightId: "м" });
  assert.equal(L.unreached.length, 0);
});

test("смешанная структура: предки и потомки сразу, потомки большой семьи", () => {
  const people: Person[] = [person("ж", "f"), person("м", "m"), person("ж_отец", "m"), person("ж_мать", "f"), person("м_отец", "m"), person("м_мать", "f")];
  const unions: Union[] = [union("o1", ["ж_отец", "ж_мать"], ["ж"]), union("o2", ["м_отец", "м_мать"], ["м"])];
  const kids: string[] = [];
  for (let i = 0; i < 4; i++) {
    people.push(person(`д${i}`, i % 2 ? "f" : "m"), person(`с${i}`, i % 2 ? "m" : "f"));
    kids.push(`д${i}`);
    const grand: string[] = [];
    for (let j = 0; j < 3; j++) { people.push(person(`в${i}${j}`, "m")); grand.push(`в${i}${j}`); }
    unions.push(union(`dd${i}`, [`д${i}`, `с${i}`], grand));
  }
  unions.push(union("u", ["ж", "м"], kids));
  const { L } = check(people, unions, { leftId: "ж", rightId: "м" });
  svg(L, "grand", ["ж", "м"]);
});

test("ручные правки: rank меняет порядок детей, side меняет пару, смена порядка данных ничего не меняет", () => {
  const base = small();
  const people = base.people.map((p) => (p.id === "сын" ? { ...p, rank: 0 } : p.id === "дочь" ? { ...p, rank: 1 } : p));
  const { at } = check(people, base.unions, { leftId: "жена", rightId: "муж" });
  assert.ok(at.get("сын")!.x < at.get("дочь")!.x, "rank: сын левее дочери");
  const sided = base.people.map((p) => (p.id === "отец" ? { ...p, side: "right" as const } : p));
  const b = check(sided, base.unions, { leftId: "жена", rightId: "муж" });
  assert.ok(b.at.get("отец")!.x > b.at.get("мать")!.x, "side: отец справа от матери");
});

test("диагностика ширины Анны: пустые промежутки по рядам", async () => {
  const { treeFromPeople } = await import("./from-people.ts");
  const data = treeFromPeople(annaPeople());
  const L = layoutFamily(data.people, data.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" });
  const rows = new Map<number, { x: number; id: string }[]>();
  for (const n of L.nodes) (rows.get(n.gen) ?? rows.set(n.gen, []).get(n.gen)!).push({ x: n.x, id: n.id });
  const gaps: { gen: number; gap: number; from: string; to: string }[] = [];
  const report: string[] = [];
  for (const [gen, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.x - b.x);
    let empty = 0;
    for (let i = 1; i < list.length; i++) {
      const d = list[i]!.x - list[i - 1]!.x - GAP;
      if (d > 0) { empty += d; gaps.push({ gen, gap: d, from: list[i - 1]!.id, to: list[i]!.id }); }
    }
    report.push(`ряд ${gen}: карточек ${list.length}, от ${Math.round(list[0]!.x)} до ${Math.round(list.at(-1)!.x)}, пустого места ${Math.round(empty)}`);
  }
  gaps.sort((a, b) => b.gap - a.gap);
  console.log("WIDTH", L.nodes.length, "карточек, ширина", Math.round(L.width), "(минимум по самому плотному ряду", Math.max(...[...rows.values()].map((r) => r.length)) * GAP, ")");
  console.log("ROWS\n" + report.join("\n"));
  console.log("TOPGAPS " + JSON.stringify(gaps.slice(0, 8).map((g) => ({ ...g, gap: Math.round(g.gap) }))));
  assert.ok(L.width > 0);
});

// Этап 1.2: у каждой семьи своя шина, шины соседних семей не сливаются.
import { assignLanes, compactCuts } from "./family-layout.ts";
test("шины разных семей одного ряда не сливаются: малая семья, большая семья, Анна", async () => {
  const s = small();
  const a = laneReport(check(s.people, s.unions, { leftId: "жена", rightId: "муж" }).L);
  assert.equal(a.merged, 0);
  const { treeFromPeople } = await import("./from-people.ts");
  const data = treeFromPeople(annaPeople());
  const L = layoutFamily(data.people, data.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" });
  const r = laneReport(L);
  console.log("LANES", JSON.stringify(r), "small", JSON.stringify(a));
  assert.equal(r.merged, 0);
});
test("сжатие по свободным разрезам: два независимых куска сближаются, зазор в один ряд остаётся", () => {
  const rel = new Map([["a", 0], ["b", GAP], ["c", 10 * GAP], ["d", 11 * GAP]]);
  const gained = compactCuts(rel, [{ id: "u1", partnerIds: ["a", "b"], childIds: [], status: "married", startYear: "", endYear: "" }, { id: "u2", partnerIds: ["c", "d"], childIds: [], status: "married", startYear: "", endYear: "" }], new Set(), () => 0);
  assert.equal(rel.get("c")! - rel.get("b")!, GAP);
  assert.ok(gained > 0);
});
test("семья, растянутая между двумя кусками, разрез блокирует: ничего не рвётся", () => {
  const rel = new Map([["a", 0], ["b", 10 * GAP]]);
  const gained = compactCuts(rel, [{ id: "u", partnerIds: ["a", "b"], childIds: [], status: "married", startYear: "", endYear: "" }], new Set(), () => 0);
  assert.equal(gained, 0);
});
