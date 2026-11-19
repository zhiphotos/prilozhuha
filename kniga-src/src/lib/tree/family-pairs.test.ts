// Этап 2: проверка ВСЕХ супружеских пар, боковых веток, нескольких браков и ручных настроек.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import test from "node:test";
import { layoutFamily } from "./family-layout.ts";
import { H_GAP, PLATE_H, PLATE_W } from "./metrics.ts";
import { annaPeople, artificial, small } from "./family-fixtures.ts";
import type { Person, Union } from "./types.ts";

const GAP = PLATE_W + H_GAP;
const person = (id: string, gender: "m" | "f", extra: Partial<Person> = {}): Person => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "", photo: "", note: "", ...extra });
const union = (id: string, partners: string[], kids: string[] = []): Union => ({ id, partnerIds: partners, childIds: kids, status: "married", startYear: "", endYear: "" });

/** Таблица по всем парам: расстояние между супругами в карточках, лежат ли дети ниже, сколько детей под парой. */
export function pairTable(people: Person[], unions: Union[], pair: { leftId: string; rightId?: string }) {
  const L = layoutFamily(people, unions, pair);
  const at = new Map(L.nodes.map((n) => [n.id, n]));
  const det = new Set(L.detached);
  const rows = [];
  for (const u of unions) {
    if (u.partnerIds.length !== 2) continue;
    const [a, b] = u.partnerIds.map((q) => at.get(q)!);
    const d = Math.abs(a!.x - b!.x) / GAP;
    const kids = u.childIds.map((c) => at.get(c)).filter((n): n is NonNullable<typeof n> => Boolean(n) && !det.has(n!.id));
    const kidsBelow = kids.every((k) => k.gen > a!.gen);
    const status = d <= 1.01 ? "рядом" : d <= 2.01 ? "через одну карточку" : "далеко";
    rows.push({ id: u.id, d: Math.round(d * 100) / 100, status, kids: kids.length, kidsBelow, partners: u.partnerIds });
  }
  return { L, at, rows };
}
export function summary(rows: ReturnType<typeof pairTable>["rows"]) {
  const c: Record<string, number> = {};
  for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
  return c;
}


function svg(L: ReturnType<typeof layoutFamily>, name: string, pair: string[], rows: ReturnType<typeof pairTable>["rows"]) {
  const bad = new Set(rows.filter((r) => r.status !== "рядом").flatMap((r) => r.partners));
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}"><rect width="100%" height="100%" fill="#fff"/>`;
  L.buses.forEach((b, bi) => { s += `<g stroke="hsl(${(bi * 47) % 360} 70% 40%)" stroke-width="4" fill="none">`; if (b.fromX != null) s += `<path d="M${b.fromX} ${b.fromY}V${b.busY}"/>`; const mn = Math.min(...b.xs, b.fromX ?? 1e9), mx = Math.max(...b.xs, b.fromX ?? -1e9); s += `<path d="M${mn} ${b.busY}H${mx}"/>`; for (const x of b.xs) s += `<path d="M${x} ${b.busY}V${b.childTop}"/>`; s += `</g>`; });
  for (const sp of L.spouses) s += `<path d="M${sp.x1} ${sp.y1}L${sp.x2} ${sp.y2}" stroke="#d33" stroke-width="5"/>`;
  for (const n of L.nodes) s += `<rect x="${n.x - PLATE_W / 2}" y="${n.y - PLATE_H / 2}" width="${PLATE_W}" height="${PLATE_H}" rx="14" fill="${pair.includes(n.id) ? "#000" : bad.has(n.id) ? "#e65100" : "#2e7d32"}"/><text x="${n.x}" y="${n.y + 12}" font-size="32" fill="#fff" text-anchor="middle">${n.id}</text>`;
  writeFileSync(`${process.env.OUTDIR ?? tmpdir()}/${name}.svg`, s + "</svg>");
}

test("искусственная семья: все пары рядом, дети ниже, боковые ветки в своём крыле", () => {
  const { people, unions } = artificial();
  const { L, at, rows } = pairTable(people, unions, { leftId: "жена", rightId: "муж" });
  svg(L, "artificial", ["жена", "муж"], rows);
  console.log("ARTIFICIAL", JSON.stringify(summary(rows)), rows.filter((r) => r.status !== "рядом").map((r) => r.id).join(","));
  assert.equal(L.nodes.length, people.length);
  assert.ok(rows.every((r) => r.kidsBelow));
  // Крыло жены левее центра пары, крыло мужа правее; боковые ветки не переходят на чужую сторону.
  const mid = (at.get("жена")!.x + at.get("муж")!.x) / 2;
  for (const id of ["отец", "мать", "дедО", "дядя", "тётя", "двоюр1", "двоюр2", "двоюр3", "сводная", "внучатый"]) assert.ok(at.get(id)!.x < mid, `${id} в крыле жены`);
  for (const id of ["свёкор", "свекровь", "деверь", "жена_деверя", "племянник_м"]) assert.ok(at.get(id)!.x > mid, `${id} в крыле мужа`);
  // Дед с двумя браками: одна карточка, обе жены рядом с ним.
  assert.equal(L.nodes.filter((n) => n.id === "дедО").length, 1);
  const ded = at.get("дедО")!;
  for (const w of ["бабО1", "бабО2"]) assert.ok(Math.abs(at.get(w)!.x - ded.x) <= 2 * GAP + 1, `${w} рядом с дедом`);
  // Шины двух браков деда не сливаются.
  const b1 = L.buses.find((b) => b.unionId === "u_дед1")!, b2 = L.buses.find((b) => b.unionId === "u_дед2")!;
  assert.ok(Math.abs(b1.busY - b2.busY) >= 4 || b1.xs.every((x) => !b2.xs.includes(x)) && Math.max(...b1.xs) < Math.min(...b2.xs) - 10 || Math.max(...b2.xs) < Math.min(...b1.xs) - 10, "шины браков деда");
  assert.ok(rows.every((r) => r.status === "рядом" || r.status === "через одну карточку"));
});

test("все пары на семье из 20 человек", async () => {
  const { people, unions } = small();
  const { L, rows } = pairTable(people, unions, { leftId: "жена", rightId: "муж" });
  svg(L, "small20_pairs", ["жена", "муж"], rows);
  console.log("SMALL20", rows.length, JSON.stringify(summary(rows)));
  assert.ok(rows.every((r) => r.status === "рядом" && r.kidsBelow));
});

test("side не ломает принадлежность веток: поменяли сторону у обоих родителей", () => {
  const { people, unions } = artificial();
  const flipped = people.map((p) => (p.id === "отец" ? { ...p, side: "right" as const } : p.id === "мать" ? { ...p, side: "left" as const } : p));
  const { at, rows, L } = pairTable(flipped, unions, { leftId: "жена", rightId: "муж" });
  assert.ok(at.get("отец")!.x > at.get("мать")!.x);
  assert.equal(L.nodes.length, people.length);
  assert.ok(rows.every((r) => r.status === "рядом" || r.status === "через одну карточку"));
  const mid = (at.get("жена")!.x + at.get("муж")!.x) / 2;
  for (const id of ["дядя", "тётя", "двоюр1", "дедО"]) assert.ok(at.get(id)!.x < mid, `${id} остался в крыле жены`);
});

test("Анна: таблица всех супружеских пар", async () => {
  const { treeFromPeople } = await import("./from-people.ts");
  const data = treeFromPeople(annaPeople());
  const { L, rows } = pairTable(data.people, data.unions, { leftId: "iaxlcs3v", rightId: "mtg8vg3n" });
  const c = summary(rows);
  const far = rows.filter((r) => r.status !== "рядом");
  console.log("ANNA_PAIRS", rows.length, JSON.stringify(c));
  console.log("ANNA_NOT_ADJACENT", JSON.stringify(far.map((r) => ({ id: r.id, d: r.d, st: r.status, partners: r.partners }))));
  console.log("ANNA_KIDS_ABOVE", rows.filter((r) => !r.kidsBelow).length);
  assert.equal(L.nodes.length, 288);
  assert.ok(rows.every((r) => r.kidsBelow));
  // Известные исключения (этап 3): u11, u99 (второй брак, первый супруг стоит между), u37, u40 (две переплетённые двоюродные семьи, общая пара u4).
  assert.deepEqual(far.map((r) => r.id).sort(), ["u11", "u37", "u40", "u99"]);
  assert.ok(far.filter((r) => r.status === "далеко").every((r) => r.id === "u37" || r.id === "u40"));
});
