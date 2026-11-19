// Регресс по диагностике Анны Ш. (288 человек, 2026-11-19): в виде «все» крыло жены и крыло мужа должны стоять каждое своей стороной, а не вперемешку по рядам.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Person as RodPerson } from "../rod/types.ts";
import { treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";

export function annaPeople(): RodPerson[] {
  const raw = readFileSync(new URL("./fixtures/anna-compact-1119.txt", import.meta.url), "utf8").trim();
  return raw.split(";").map((row) => {
    const [id, g, par, sp, more, side, rel, st] = row.split(",") as string[];
    return {
      id: id!, name: id!, relation: rel!, maidenName: "", notes: "", birthYear: "",
      gender: g as "m" | "f",
      parents: par ? par.split("+") : undefined,
      spouse: sp || undefined,
      moreSpouses: more ? more.split("+").map((m) => ({ id: m, status: "married" as const })) : undefined,
      spouseStatus: st === "married" ? "married" : undefined,
      treeSide: side === "left" || side === "right" ? side : undefined,
    } as RodPerson;
  });
}

/** Чья сторона: поиск в ширину от «меня» и «мужа» одновременно, связь между ними не считается. */
export function sides(data: ReturnType<typeof treeFromPeople>, me: string, husband: string): Map<string, "W" | "H"> {
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  for (const u of data.unions) {
    if (u.partnerIds.length === 2 && u.partnerIds.includes(me) && u.partnerIds.includes(husband)) { for (const c of u.childIds) { link(me, c); link(husband, c); } continue; }
    if (u.partnerIds.length === 2) link(u.partnerIds[0]!, u.partnerIds[1]!);
    for (const p of u.partnerIds) for (const c of u.childIds) link(p, c);
  }
  const out = new Map<string, "W" | "H">([[me, "W"], [husband, "H"]]);
  const q = [me, husband];
  for (let i = 0; i < q.length; i++) for (const n of adj.get(q[i]!) ?? []) if (!out.has(n)) { out.set(n, out.get(q[i]!)!); q.push(n); }
  return out;
}

export function wingStats(layout: ReturnType<typeof layoutTree>, side: Map<string, "W" | "H">) {
  const rows = new Map<number, { x: number; s: "W" | "H" }[]>();
  for (const n of layout.nodes) {
    const s = side.get(n.id);
    if (!s) continue;
    (rows.get(Math.round(n.y)) ?? rows.set(Math.round(n.y), []).get(Math.round(n.y))!).push({ x: n.x, s });
  }
  let switches = 0, total = 0;
  for (const list of rows.values()) {
    list.sort((a, b) => a.x - b.x);
    for (let i = 1; i < list.length; i++) if (list[i]!.s !== list[i - 1]!.s) switches++;
    total += list.length;
  }
  return { rows: rows.size, switches, total, width: layout.width };
}

test("Анна: крылья мужа и жены в виде «все» не перемешаны по рядам", () => {
  const data = treeFromPeople(annaPeople());
  const me = "iaxlcs3v", husband = "mtg8vg3n";
  const layout = layoutTree(data.people, data.unions, me);
  const stats = wingStats(layout, sides(data, me, husband));
  console.log("wings", JSON.stringify(stats));
  assert.ok(stats.switches <= stats.rows * 2, `переключений стороны в рядах: ${stats.switches} при ${stats.rows} рядах`);
});

/** Четыре ветви: отец и мама жены, отец и мама мужа (поиск в ширину от четырёх родителей, связи между ними не считаются). */
test("Анна: четыре ветви (родители жены и мужа) не перемешаны по рядам", () => {
  const data = treeFromPeople(annaPeople());
  const layout = layoutTree(data.people, data.unions, "iaxlcs3v");
  const roots = ["4xnltrmm", "iyrr5ih1", "8r5snfvt", "obybuy7b"];
  const adj = new Map<string, string[]>();
  const link = (a: string, b: string) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a); };
  for (const u of data.unions) {
    if (u.partnerIds.length === 2 && u.partnerIds.every((p) => roots.includes(p))) continue;
    if (u.partnerIds.length === 2) link(u.partnerIds[0]!, u.partnerIds[1]!);
    for (const p of u.partnerIds) for (const c of u.childIds) link(p, c);
  }
  const lab = new Map<string, number>(roots.map((r, i) => [r, i]));
  const q = [...roots];
  const block = new Set(["iaxlcs3v", "mtg8vg3n"]);
  for (let i = 0; i < q.length; i++) for (const n of adj.get(q[i]!) ?? []) if (!lab.has(n) && !block.has(n)) { lab.set(n, lab.get(q[i]!)!); q.push(n); }
  const rows = new Map<number, { x: number; s: number }[]>();
  for (const n of layout.nodes) {
    const s = lab.get(n.id);
    if (s === undefined) continue;
    (rows.get(Math.round(n.y)) ?? rows.set(Math.round(n.y), []).get(Math.round(n.y))!).push({ x: n.x, s });
  }
  let switches = 0;
  const per: number[] = [];
  for (const [y, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => a.x - b.x);
    let sw = 0;
    for (let i = 1; i < list.length; i++) if (list[i]!.s !== list[i - 1]!.s) sw++;
    per.push(sw);
    switches += sw;
  }
  console.log("branches switches", switches, "per row", JSON.stringify(per), "rows", rows.size);
  assert.ok(switches <= rows.size * 3, `переключений ветви: ${switches}`);
});

test("Анна: раскраска сторон даёт свой цвет родне жены и родне мужа", async () => {
  const { sideColors } = await import("./branch-colors.ts");
  const data = treeFromPeople(annaPeople());
  const colors = sideColors(data.people, data.unions, "iaxlcs3v", "W", "H");
  const sd = sides(data, "iaxlcs3v", "mtg8vg3n");
  const withParents = new Set(data.unions.flatMap((u) => u.childIds));
  assert.ok(Object.keys(colors).length > 10, "цвет получили старшие предки");
  for (const [id, color] of Object.entries(colors)) {
    assert.ok(!withParents.has(id), "цвет только у тех, у кого нет родителей в древе");
    assert.equal(color, sd.get(id), "сторона совпадает с обходом от пары");
  }
  assert.ok(Object.values(colors).includes("W") && Object.values(colors).includes("H"));
});
