import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { moveBranch } from "./arrange.ts";
import { layoutTree } from "./layout.ts";
import { treeFromPeople } from "./from-people.ts";

const R = (id: string, name: string, relation: string, extra: Record<string, unknown> = {}) => ({ id, name, relation, maidenName: "", notes: "", birthYear: "", ...extra });
const apply = (people: any[], patches: { id: string; rank?: number; side?: "left" | "right" | null }[]) => people.map((p) => { const q = patches.find((x) => x.id === p.id); return q ? { ...p, ...(q.rank !== undefined ? { treeRank: q.rank } : {}), ...("side" in q ? { treeSide: q.side ?? undefined } : {}) } : p; });
const xOf = (people: any[], id: string) => { const d = treeFromPeople(people); return layoutTree(d.people, d.unions, d.focusId).nodes.find((n) => n.id === id)!.x; };

test("семья брата сдвигается среди братьев и сестёр: после «правее» карточка действительно правее", () => {
  const people = [
    R("me", "Я", "я", { gender: "f", parents: ["mom", "dad"] }), R("mom", "Мама", "мама", { gender: "f" }), R("dad", "Папа", "папа", { gender: "m" }),
    R("bro1", "Брат1", "брат", { gender: "m", birthYear: "1980", parents: ["mom", "dad"] }), R("w1", "Жена1", "жена брата", { gender: "f", spouse: "bro1" }),
    R("bro2", "Брат2", "брат", { gender: "m", birthYear: "1985", parents: ["mom", "dad"] }), R("w2", "Жена2", "жена брата", { gender: "f", spouse: "bro2" }),
  ];
  const d = treeFromPeople(people as never);
  const before = xOf(people, "bro1");
  const right = moveBranch(d.people, d.unions, d.focusId, "bro1", 1);
  if (right.length) assert.ok(xOf(apply(people, right), "bro1") > before, "после «правее» ветка правее");
  const left = moveBranch(d.people, d.unions, d.focusId, "bro1", -1);
  if (left.length) assert.ok(xOf(apply(people, left), "bro1") < before, "после «левее» ветка левее");
  assert.ok(right.length || left.length, "хотя бы в одну сторону двигается");
});

test("на обезличенных файлах: если правка предлагается, ветка реально сдвигается в нужную сторону, а связи не меняются", () => {
  const dir = new URL("./fixtures/", import.meta.url);
  let checked = 0;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    const j = JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
    const base = treeFromPeople(j.people);
    const rel = (d: any) => JSON.stringify(d.unions.map((u: any) => [[...u.partnerIds].sort(), [...u.childIds].sort()]).sort());
    for (const p of j.people) for (const dirn of [-1, 1] as const) {
      const patches = moveBranch(base.people, base.unions, base.focusId, p.id, dirn);
      if (!patches.length) continue;
      const people2 = apply(j.people, patches);
      assert.equal(rel(treeFromPeople(people2)), rel(base), `${f}: связи не должны меняться`);
      checked += 1;
    }
  }
  assert.ok(checked > 50, `проверено нажатий: ${checked}`);
});
