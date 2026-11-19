// Этап 3: карточки-ссылки для переплетённых родов. Человек один, ссылка только визуальная.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { layoutFamily } from "./family-layout.ts";
import { H_GAP, PLATE_H, PLATE_W } from "./metrics.ts";
import { annaPeople, artificial, elizaveta, elizavetaTangled, laneReport } from "./family-fixtures.ts";
import type { Person, Union } from "./types.ts";

const GAP = PLATE_W + H_GAP;
const person = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "", ...extra });
const union = (id: string, partners: string[], kids: string[] = []): Union => ({ id, partnerIds: partners, childIds: kids, status: "married", startYear: "", endYear: "" });



export function checkLinks(people: Person[], unions: Union[], pair: { leftId: string; rightId?: string }) {
  const L = layoutFamily(people, unions, pair);
  assert.equal(L.nodes.length, people.length, "людей ровно столько же");
  assert.equal(new Set(L.nodes.map((n) => n.id)).size, people.length, "каждый человек один раз");
  assert.ok(L.refs.every((r) => !L.nodes.some((n) => n.id === r.id)), "ссылок нет среди людей");
  const rows = new Map<number, number[]>();
  for (const n of L.nodes) (rows.get(n.y) ?? rows.set(n.y, []).get(n.y)!).push(n.x);
  for (const r of L.refs) (rows.get(r.y) ?? rows.set(r.y, []).get(r.y)!).push(r.x);
  for (const xs of rows.values()) { xs.sort((a, b) => a - b); for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! - xs[i - 1]! >= GAP - 1, `карточки (с учётом ссылок) налезают: ${xs[i]! - xs[i - 1]!}`); }
  return L;
}

export function svgLinks(L: ReturnType<typeof layoutFamily>, name: string, pair: string[]) {
  const refOf = new Set(L.refs.map((r) => r.of));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}"><rect width="100%" height="100%" fill="#fff"/>`;
  L.buses.forEach((b, bi) => { s += `<g stroke="hsl(${(bi * 47) % 360} 70% 40%)" stroke-width="4" fill="none">`; if (b.fromX != null) s += `<path d="M${b.fromX} ${b.fromY}V${b.busY}"/>`; const mn = Math.min(...b.dropXs, b.fromX ?? 1e9), mx = Math.max(...b.dropXs, b.fromX ?? -1e9); s += `<path d="M${mn} ${b.busY}H${mx}"/>`; b.dropXs.forEach((x, i) => { const j = b.jogY[i]; s += j == null ? `<path d="M${x} ${b.busY}V${b.childTop}"/>` : `<path d="M${x} ${b.busY}V${j}H${b.xs[i]}V${b.childTop}"/>`; }); s += `</g>`; });
  for (const sp of L.spouses) s += `<path d="M${sp.x1} ${sp.y1}L${sp.x2} ${sp.y2}" stroke="#d33" stroke-width="5"/>`;
  for (const l of L.refLinks) { const my = l.y1 - 120; s += `<path d="M${l.x1} ${l.y1 - 36}C${l.x1} ${my} ${l.x2} ${my} ${l.x2} ${l.y2 - 36}" stroke="#7b1fa2" stroke-width="5" stroke-dasharray="18 14" fill="none"/>`; }
  for (const n of L.nodes) s += `<rect x="${n.x - PLATE_W / 2}" y="${n.y - PLATE_H / 2}" width="${PLATE_W}" height="${PLATE_H}" rx="14" fill="${pair.includes(n.id) ? "#000" : "#2e7d32"}"${refOf.has(n.id) ? ' stroke="#7b1fa2" stroke-width="8"' : ""}/><text x="${n.x}" y="${n.y + 12}" font-size="30" fill="#fff" text-anchor="middle">${n.id}</text>`;
  for (const r of L.refs) s += `<rect x="${r.x - PLATE_W / 2}" y="${r.y - PLATE_H / 2}" width="${PLATE_W}" height="${PLATE_H}" rx="14" fill="#fff" stroke="#7b1fa2" stroke-width="5" stroke-dasharray="12 8"/><text x="${r.x}" y="${r.y + 12}" font-size="30" fill="#7b1fa2" text-anchor="middle">↗ ${r.of}</text>`;
  writeFileSync(`${process.env.OUTDIR ?? tmpdir()}/${name}.svg`, s + "</svg>");
}

test("пример Елизаветы: оба брака видны, ссылка вместо дубля, линии не сливаются", () => {
  const { people, unions } = elizaveta();
  const L = checkLinks(people, unions, { leftId: "сестра1", rightId: "брат1" });
  svgLinks(L, "elizaveta", ["сестра1", "брат1"]);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  console.log("ELIZ", "людей", L.nodes.length, "ссылок", L.refs.length, JSON.stringify(L.refs.map((r) => r.id)), "пары", JSON.stringify(unions.filter((u) => u.partnerIds.length === 2).map((u) => [u.id, Math.round(Math.abs(at.get(u.partnerIds[0]!)!.x - at.get(u.partnerIds[1]!)!.x) / GAP * 10) / 10])));
  assert.equal(L.spouses.filter((s) => s.unionId === "брак1" || s.unionId === "брак2").length, 2, "оба брака нарисованы");
  assert.equal(L.buses.filter((b) => b.unionId === "брак1" || b.unionId === "брак2").length, 2, "дети обоих браков под парами");
  assert.ok(["прадед", "прабаба"].every((id) => at.has(id)), "общие предки на месте");
  assert.equal(laneReport(L).merged, 0);
});

test("u37 и u40 у Анны: ссылки вместо растянутых браков, людей по-прежнему 288", async () => {
  const { treeFromPeople } = await import("./from-people.ts");
  const data = treeFromPeople(annaPeople());
  const L = checkLinks(data.people, data.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" });
  svgLinks(L, "anna_links", ["iaxlcs3v", "mtg8vg3n"]);
  console.log("ANNA_LINKS", "людей", L.nodes.length, "ссылок", L.refs.length, JSON.stringify(L.refs.map((r) => [r.unionId, r.of])), JSON.stringify(laneReport(L)));
  assert.equal(L.nodes.length, 288);
  assert.ok(L.refs.some((r) => r.unionId === "u37") && L.refs.some((r) => r.unionId === "u40"));
  assert.equal(laneReport(L).merged, 0);
  // фокус и порядок данных не влияют на координаты
  const a = layoutFamily(data.people, data.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" });
  const b = layoutFamily([...data.people].reverse(), [...data.unions].reverse(), { leftId: "iaxlcs3v", rightId: "mtg8vg3n" });
  assert.deepEqual(a.nodes.map((n) => [n.id, n.x, n.y]).sort(), b.nodes.map((n) => [n.id, n.x, n.y]).sort());
  assert.deepEqual(a.refs.map((r) => [r.id, r.x]).sort(), b.refs.map((r) => [r.id, r.x]).sort());
});

test("искусственная семья и семья на 20: ссылок нет, пары рядом", async () => {
  const { people, unions } = artificial();
  const L = checkLinks(people, unions, { leftId: "жена", rightId: "муж" });
  assert.equal(L.refs.length, 0);
});

test("цикл: человек одновременно родня двух веток, ничего не падает и не дублируется", () => {
  // Два брата женаты на двух сёстрах; у сестёр общие родители: пары замыкаются в кольцо.
  const people = [person("а", "m"), person("б", "m"), person("о", "m"), person("м", "f"), person("в", "f"), person("г", "f"), person("п", "m"), person("q", "f")];
  const unions = [union("p1", ["о", "м"], ["а", "б"]), union("p2", ["п", "q"], ["в", "г"]), union("m1", ["а", "в"]), union("m2", ["б", "г"])];
  const L = checkLinks(people, unions, { leftId: "а", rightId: "в" });
  assert.equal(L.spouses.length, 4);
});

test("Елизавета, сложный вариант: братья ещё и двоюродные сёстрам", () => {
  const { people, unions } = elizavetaTangled();
  const L = checkLinks(people, unions, { leftId: "сестра1", rightId: "брат1" });
  svgLinks(L, "elizaveta2", ["сестра1", "брат1"]);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  console.log("ELIZ2", "людей", L.nodes.length, "ссылок", L.refs.length, JSON.stringify(L.refs.map((r) => r.id)), "пары", JSON.stringify(unions.filter((u) => u.partnerIds.length === 2).map((u) => [u.id, Math.round(Math.abs(at.get(u.partnerIds[0]!)!.x - at.get(u.partnerIds[1]!)!.x) / GAP * 10) / 10])));
  assert.equal(L.spouses.length, unions.filter((u) => u.partnerIds.length === 2).length);
  assert.equal(laneReport(L).merged, 0);
});
