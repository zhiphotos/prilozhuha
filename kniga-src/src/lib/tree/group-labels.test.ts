// Этап 4.3: подписи «Отдельные ветки» и «Записи без связей: N». Координаты карточек не меняются.
import assert from "node:assert/strict";
import test from "node:test";
import { buildLayout } from "./layout-engine.ts";
import { layoutFamily } from "./family-layout.ts";
import { PLATE_W, PORTRAIT_R } from "./metrics.ts";
import { person, union } from "./family-fixtures.ts";
import type { Person, Union } from "./types.ts";

function world(groups: number, singles: number) {
  const people: Person[] = [person("ж", "f"), person("м", "m"), person("д", "m")];
  const unions: Union[] = [union("осн", ["ж", "м"], ["д"])];
  for (let i = 0; i < groups; i++) {
    const p = (id: string, g: "m" | "f") => person(`г${i}${id}`, g);
    people.push(p("а", "m"), p("б", "f"), p("в", "m"));
    unions.push(union(`гu${i}`, [`г${i}а`, `г${i}б`], [`г${i}в`]));
  }
  for (let i = 0; i < singles; i++) people.push(person(`о${i}`, i % 2 ? "m" : "f"));
  return { people, unions };
}
const build = (w: ReturnType<typeof world>, flow: "down" | "up" = "down") => buildLayout(w.people, w.unions, "ж", flow, { engine: "family", pair: { leftId: "ж", rightId: "м" } });

test("N в «Записи без связей» считается по данным, а не зашит", () => {
  for (const n of [1, 5, 17]) {
    const g = build(world(0, n)).groups!;
    assert.equal(g.length, 1);
    assert.equal(g[0]!.text, `Записи без связей: ${n}`);
    assert.equal(g[0]!.count, n);
  }
});

test("обе подписи, когда есть и ветки, и одиночки; нет групп: нет подписей", () => {
  const both = build(world(3, 4)).groups!;
  assert.deepEqual(both.map((g) => g.kind), ["branches", "singles"]);
  assert.equal(both[0]!.text, "Отдельные ветки");
  assert.equal(both[0]!.count, 9);
  assert.deepEqual(build(world(0, 0)).groups, []);
  assert.equal(buildLayout(world(1, 1).people, world(1, 1).unions, "ж", "down", { engine: "classic" }).groups, undefined);
});

test("подпись стоит над своей группой и не заходит на её карточки; переход ведёт на карточку группы", () => {
  for (const flow of ["down", "up"] as const) {
    const L = build(world(2, 6), flow);
    for (const g of L.groups!) {
      const anchor = L.nodes.find((n) => n.id === g.anchorId)!;
      assert.ok(anchor, "карточка перехода существует");
      assert.ok(g.y + 30 < Math.min(...L.nodes.filter((n) => (g.kind === "singles" ? n.id.startsWith("о") : n.id.startsWith("г"))).map((n) => n.y)) - PORTRAIT_R + 1, "подпись выше первого ряда группы");
      assert.ok(g.y > 0, "подпись внутри листа");
      assert.ok(anchor.x - PLATE_W / 2 >= g.x - 1);
    }
  }
});

test("подписи не двигают карточки", () => {
  const w = world(2, 6);
  const a = build(w);
  const b = layoutFamily(w.people, w.unions, { leftId: "ж", rightId: "м" });
  assert.deepEqual(a.nodes.map((n) => [n.id, n.x, n.y]).sort(), b.nodes.map((n) => [n.id, n.x, n.y]).sort());
});
