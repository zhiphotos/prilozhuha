// Разбор диагностического файла: раскладка дерева и положение выбранных людей. Запуск:
//   node --experimental-strip-types --import ./src/test-support/register.mjs scripts/inspect-diag.mjs файл.json "Имя1" "Имя2"
// Печатает только структуру и положение, заметки и даты не выводит.
import { readFileSync } from "node:fs";
const { treeFromPeople } = await import("../src/lib/tree/from-people.ts");
const { layoutTree } = await import("../src/lib/tree/layout.ts");

const [file, ...names] = process.argv.slice(2);
const diag = JSON.parse(readFileSync(file, "utf8"));
const people = diag.people;
const data = treeFromPeople(people);
const flow = diag.view?.flow === "up" ? "up" : "down";
const layout = layoutTree(data.people, data.unions, data.focusId, flow);
const byId = new Map(layout.nodes.map((n) => [n.id, n]));
const nameOf = (id) => {
  const p = data.people.find((x) => x.id === id);
  return p ? `${p.firstName} ${p.lastName}`.trim() : id.slice(0, 6);
};
console.log(`людей ${people.length}, узлов раскладки ${layout.nodes.length}, ширина ${Math.round(layout.width)}, высота ${Math.round(layout.height)}, центр: ${nameOf(data.focusId)}`);
const rows = new Map();
for (const n of layout.nodes) {
  const y = Math.round(n.y);
  rows.set(y, [...(rows.get(y) ?? []), n]);
}
for (const [y, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
  list.sort((a, b) => a.x - b.x);
  console.log(`\n-- ряд y=${y}`);
  console.log(list.map((n) => `${nameOf(n.id)}@${Math.round(n.x)}`).join(" | "));
}
for (const q of names) {
  const hit = data.people.find((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q.toLowerCase()));
  if (!hit) {
    console.log(`\n«${q}»: не найден`);
    continue;
  }
  const n = byId.get(hit.id);
  const parentUnions = data.unions.filter((u) => u.childIds.includes(hit.id));
  console.log(`\n«${q}»: x=${n ? Math.round(n.x) : "?"} y=${n ? Math.round(n.y) : "?"}; родители: ${parentUnions.map((u) => u.partnerIds.map(nameOf).join(" + ")).join("; ") || "нет"}; сторона: ${hit.treeSide ?? "—"}`);
}
