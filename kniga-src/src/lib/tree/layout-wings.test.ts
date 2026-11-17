import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";

const person = (id: string, o: Record<string, unknown> = {}) => ({ id, name: id, firstName: id, relation: "", birthYear: "", maidenName: "", notes: "", gender: "m", fromFile: true, parents: [] as string[], ...o });
const place = (people: unknown[], focus: string) => {
  const t = treeFromPeople(people as never);
  const L = layoutTree(t.people, t.unions, focus, "down");
  const x = (id: string) => L.nodes.find((n) => n.id === id)!.x;
  return { L, x, t };
};
const mid = (a: number, b: number) => (a + b) / 2;

test("два крыла: родители супруга стоят прямо над ним, связь не спрятана", () => {
  const { L, x } = place(
    [
      person("me", { gender: "f", parents: ["dad", "mom"], spouse: "h" }),
      person("h", { spouse: "me", parents: ["hp", "hm"] }),
      person("dad", { spouse: "mom" }),
      person("mom", { gender: "f", spouse: "dad", parents: ["gp", "gm"] }),
      person("gp", { spouse: "gm" }),
      person("gm", { gender: "f", spouse: "gp" }),
      person("hp", { spouse: "hm" }),
      person("hm", { gender: "f", spouse: "hp" }),
      person("kid", { parents: ["me", "h"] }),
    ],
    "me",
  );
  assert.ok(Math.abs(mid(x("hp"), x("hm")) - x("h")) < 1, "родители мужа над ним");
  assert.ok(Math.abs(mid(x("dad"), x("mom")) - x("me")) < 1, "мои родители надо мной");
  assert.equal(L.detached.length, 0, "ни одна связь с родителями не спрятана");
  const lo = Math.min(x("me"), x("h"));
  const hi = Math.max(x("me"), x("h"));
  assert.ok(x("kid") > lo && x("kid") < hi, "ребёнок между крыльями");
});

test("у супруга нет родителей: пара стоит рядом, как раньше", () => {
  const { x } = place([person("me", { gender: "f", parents: ["dad", "mom"], spouse: "h" }), person("h", { spouse: "me" }), person("dad", { spouse: "mom" }), person("mom", { gender: "f", spouse: "dad" })], "me");
  assert.ok(Math.abs(x("me") - x("h")) <= 400, "супруги рядом");
});

test("у выбранного нет родителей, у супруга есть: родители супруга над ним", () => {
  const { x } = place([person("me", { gender: "f", spouse: "h" }), person("h", { spouse: "me", parents: ["hp", "hm"] }), person("hp", { spouse: "hm" }), person("hm", { gender: "f", spouse: "hp" })], "me");
  assert.ok(Math.abs(mid(x("hp"), x("hm")) - x("h")) < 1);
});

test("сторона крыла: супруг, поставленный слева, остаётся слева", () => {
  const base = (side: "left" | "right") => [
    person("me", { gender: "f", parents: ["dad", "mom"], spouse: "h" }),
    person("h", { spouse: "me", parents: ["hp", "hm"], treeSide: side }),
    person("dad", { spouse: "mom" }),
    person("mom", { gender: "f", spouse: "dad" }),
    person("hp", { spouse: "hm" }),
    person("hm", { gender: "f", spouse: "hp" }),
  ];
  const left = place(base("left"), "me");
  const right = place(base("right"), "me");
  assert.ok(left.x("h") < left.x("me"), "слева");
  assert.ok(right.x("h") > right.x("me"), "справа");
});

test("несколько браков у выбранного: у каждого супруга своё крыло или он рядом, карточки не накладываются", () => {
  const { L } = place(
    [
      person("me", { gender: "f", parents: ["dad", "mom"], spouse: "h1", moreSpouses: [{ id: "h2" }] }),
      person("h1", { spouse: "me", parents: ["p1", "q1"], spouseStatus: "divorced" }),
      person("h2", { spouse: "me", parents: ["p2", "q2"] }),
      person("dad", { spouse: "mom" }),
      person("mom", { gender: "f", spouse: "dad" }),
      person("p1", { spouse: "q1" }),
      person("q1", { gender: "f", spouse: "p1" }),
      person("p2", { spouse: "q2" }),
      person("q2", { gender: "f", spouse: "p2" }),
    ],
    "me",
  );
  const byRow = new Map<number, number[]>();
  for (const n of L.nodes) byRow.set(n.y, [...(byRow.get(n.y) ?? []), n.x]);
  for (const xs of byRow.values()) {
    const sorted = xs.slice().sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i]! - sorted[i - 1]! >= 100, "карточки не накладываются");
  }
});
