// Замер «родители над ребёнком»: node --experimental-strip-types --import ./src/test-support/register.mjs scripts/measure-parents-above.mts [путь к family-layout.ts] [--json out.json]
// Без аргумента берётся текущая раскладка из репозитория; со вторым путём можно сравнить с копией старого кода.
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { treeFromPeople } from "../src/lib/tree/from-people.ts";
import { annaPeople } from "../src/lib/tree/family-fixtures.ts";
import { resolveCentralPair } from "../src/lib/tree/layout-engine.ts";
import { randomWorld, bigWorld, treeOf } from "../src/lib/tree/family-wings-fixtures.ts";
import { emptyAgg, fmtAgg, measureOne, type Agg, type LayoutFn } from "../src/lib/tree/family-parents-metrics.ts";

const args = process.argv.slice(2);
const jsonAt = args.indexOf("--json");
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : undefined;
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const modPath = args.find((a) => a.endsWith(".ts"));
const mod = await import(modPath ? pathToFileURL(resolve(modPath)).href : "../src/lib/tree/family-layout.ts");
const fn: LayoutFn = mod.layoutFamily;
const T = new URL("../src/lib/tree/fixtures/", import.meta.url);
const res: Record<string, Agg> = {};
const go = (name: string, items: { t: { people: never[]; unions: never[] }; pair: { leftId: string; rightId?: string } }[]) => {
  if (only && !name.startsWith(only)) return;
  const a = emptyAgg();
  for (const { t, pair } of items) measureOne(a, fn, t.people, t.unions, pair);
  res[name] = a;
  console.log(fmtAgg(name, a));
};
go("Анна", [{ t: treeFromPeople(annaPeople() as never) as never, pair: { leftId: "iaxlcs3v", rightId: "mtg8vg3n" } }]);
for (const f of ["diag-1029", "diag-1029b", "diag-1030", "diag-1101"]) {
  const t = treeOf(JSON.parse(readFileSync(new URL(`${f}-anon.json`, T), "utf8")).people);
  const items: { t: never; pair: { leftId: string; rightId?: string } }[] = [];
  for (const p of t.people) { const { pair } = resolveCentralPair(t.people as never, t.unions as never, p.id); if (pair.rightId) items.push({ t: t as never, pair }); }
  go(`${f} (${t.people.length} чел)`, items);
}
go("синтетика x40", Array.from({ length: 40 }, (_, i) => ({ t: treeOf(randomWorld(i + 1, 4 + ((i + 1) % 3), 0.6)) as never, pair: { leftId: "W", rightId: "H" } })));
for (const n of [2000, 5000]) go(`bigWorld ${n}`, [{ t: treeOf(bigWorld(n)) as never, pair: { leftId: "W", rightId: "H" } }]);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(res, null, 1));
