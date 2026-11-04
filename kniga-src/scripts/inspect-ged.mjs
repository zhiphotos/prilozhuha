// Проверка GED-файла: сколько людей и связей, нет ли «оторванных» и как ляжет раскладка. Запуск:
//   node --experimental-strip-types --import ./src/test-support/register.mjs scripts/inspect-ged.mjs файл.ged
// Имена и заметки не печатает.
import { readFileSync } from "node:fs";
const { parseGedcom } = await import("../src/lib/tree/importTree.ts");
const { layoutTree } = await import("../src/lib/tree/layout.ts");

const res = parseGedcom(readFileSync(process.argv[2], "utf8"));
if ("error" in res) {
  console.log("ошибка разбора:", res.error);
  process.exit(1);
}
const { people, unions, focusId } = res.tree;
const linked = new Set();
for (const u of unions) for (const id of [...u.partnerIds, ...u.childIds]) linked.add(id);
const loose = people.filter((p) => !linked.has(p.id)).length;
const t0 = Date.now();
const L = layoutTree(people, unions, focusId, "down");
const ids = new Set(L.nodes.map((n) => n.id));
const missing = people.filter((p) => !ids.has(p.id)).length;
const overlaps = (() => {
  const rows = new Map();
  for (const n of L.nodes) rows.set(Math.round(n.y), [...(rows.get(Math.round(n.y)) ?? []), n.x]);
  let bad = 0;
  for (const xs of rows.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 100) bad++;
  }
  return bad;
})();
console.log(`людей ${people.length}, союзов ${unions.length}, без связей ${loose}, неоднозначных ${res.tree.ambiguous?.length ?? 0}`);
console.log(`раскладка: узлов ${L.nodes.length}, пропали ${missing}, наложений в рядах ${overlaps}, ширина ${Math.round(L.width)}, высота ${Math.round(L.height)}, ${Date.now() - t0} мс`);
