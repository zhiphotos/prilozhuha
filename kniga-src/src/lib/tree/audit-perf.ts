import { treeFromPeople } from "./from-people.ts";
import { buildLayout } from "./layout-engine.ts";
import { buildKinIndex, kinshipIn } from "./kinship.ts";
import { searchPeople } from "./search.ts";
import type { Person as R } from "../rod/types.ts";
function book(n: number): R[] {
  const out: R[] = [{ id: "me", name: "Иван Иванов", relation: "Я", maidenName: "", notes: "", birthYear: "1980", gender: "m" } as R];
  let s = 7; const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  // предки: двоичное дерево вверх, пока не наберём n
  const q = ["me"]; let i = 0;
  while (out.length < n && i < q.length) {
    const c = q[i++]!; const f = "f" + out.length, m = "m" + out.length;
    out.push({ id: f, name: "Отец" + out.length + " Петров", relation: "Предок", maidenName: "", notes: "заметка ".repeat(10), birthYear: String(1900 - i), gender: "m", spouse: m } as R);
    out.push({ id: m, name: "Мать" + out.length + " Сидорова", relation: "Предок", maidenName: "", notes: "", birthYear: String(1902 - i), gender: "f", spouse: f } as R);
    const cp = out.find((p) => p.id === c)!; cp.parents = [f, m];
    if (rnd() < 0.9) q.push(f); if (rnd() < 0.9) q.push(m);
  }
  return out.slice(0, n);
}
const t = <T,>(f: () => T): [T, number] => { const a = performance.now(); const r = f(); return [r, performance.now() - a]; };
const fmt = (x: number) => (x < 1 ? "<1" : String(Math.round(x))) + "мс";
for (const n of [100, 500, 1000, 2000, 5000]) {
  const ppl = book(n);
  const [d, tTree] = t(() => treeFromPeople(ppl));
  const [Lf, tFam] = t(() => buildLayout(d.people, d.unions, d.focusId, "down", { engine: "family", ownerId: d.focusId }));
  const [Lc, tCls] = t(() => buildLayout(d.people, d.unions, d.focusId, "down", { engine: "classic" }));
  // смена центра на 20 разных людей
  const ids = d.people.filter((_, k) => k % Math.max(1, Math.floor(d.people.length / 20)) === 0).map((p) => p.id);
  const [, tRe] = t(() => { for (const id of ids) buildLayout(d.people, d.unions, id, "down", { engine: "classic" }); });
  const [, tKin] = t(() => { const ix = buildKinIndex(d.people, d.unions); for (const p of d.people) kinshipIn(ix, d.focusId, p.id); });
  const [, tSearch] = t(() => { for (let k = 0; k < 50; k++) searchPeople(d.people, "Петров"); });
  const [js, tJson] = t(() => JSON.stringify(ppl));
  const mem = process.memoryUsage().heapUsed / 1048576;
  console.log(`n=${n} | сборка древа ${fmt(tTree)} | family ${fmt(tFam)} (узлов ${Lf.nodes.length}, лист ${Math.round(Lf.width)}×${Math.round(Lf.height)}) | classic ${fmt(tCls)} (${Math.round(Lc.width)}×${Math.round(Lc.height)}) | смена центра ×20: ${fmt(tRe)} (${fmt(tRe / 20)}/раз) | родство для всех ${fmt(tKin)} | поиск ×50 ${fmt(tSearch)} | JSON ${Math.round(js.length / 1024)}КБ ${fmt(tJson)} | heap ${Math.round(mem)}МБ`);
}
