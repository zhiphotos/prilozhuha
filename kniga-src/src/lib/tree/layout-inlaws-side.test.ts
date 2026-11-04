// Родители супруга, который стоит слева от выбранного, встают слева рядом с ним, а не в конце ряда (случай с диагностикой из таблицы тестировщиков).
import assert from "node:assert/strict";
import test from "node:test";
import { treeFromPeople } from "./from-people.ts";
import { layoutTree } from "./layout.ts";

const person = (id: string, o: Record<string, unknown> = {}) => ({ id, name: id, firstName: id, relation: "", birthYear: "", maidenName: "", notes: "", gender: "m", fromFile: true, parents: [] as string[], ...o });

test("родители мужа стоят левее его, а не за роднёй мамы", () => {
  const people = [
    person("f", { gender: "f", parents: ["dad", "mom"], spouse: "h" }),
    person("h", { spouse: "f", parents: ["hp", "hm"], treeSide: "left" }),
    person("dad", { spouse: "mom" }),
    person("mom", { gender: "f", spouse: "dad" }),
    person("hp", { spouse: "hm" }),
    person("hm", { gender: "f", spouse: "hp" }),
    person("bro", { parents: ["hp", "hm"] }),
    person("aunt", { gender: "f", parents: ["gp", "gm"] }),
    person("mom2", { gender: "f", parents: ["gp", "gm"], spouse: "dad2" }),
    person("gp", { spouse: "gm" }),
    person("gm", { gender: "f", spouse: "gp" }),
  ];
  // мама ещё и дочь gp/gm: у неё есть сестра aunt
  const fixed = people.map((p) => (p.id === "mom" ? { ...p, parents: ["gp", "gm"] } : p)).filter((p) => p.id !== "mom2");
  const t = treeFromPeople(fixed as never);
  const L = layoutTree(t.people, t.unions, "f", "down");
  const x = (id: string) => L.nodes.find((n) => n.id === id)!.x;
  assert.ok(x("hp") < x("h"), "родители мужа левее мужа или над ним");
  assert.ok(x("hp") < x("gp"), "родители мужа левее родни мамы");
});
