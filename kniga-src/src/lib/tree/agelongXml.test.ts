import assert from "node:assert/strict";
import test from "node:test";
import { isAgelongXml, parseAgelongXml } from "./agelongXml.ts";

const xml = `<?xml version="1.0" encoding="utf-8"?>
<agelongtree guid="x" lang="ru"><persons>
<person id="1" sex="М" fullname="Иванов Пётр Сергеевич" fn="Пётр" mn="Сергеевич" sn="Иванов" bdate="01.02.1950"><nearest><person id="2" rel="Жена" relcode="B" fullname="Иванова Мария" /><person id="3" rel="Сын" relcode="S" fullname="Иванов Олег" /></nearest></person>
<person id="2" sex="Ж" fullname="Иванова (Петрова) Мария Ильинична" fn="Мария" mn="Ильинична" sn="Иванова" msn="Петрова" bdate="1952"><nearest><person id="1" rel="Муж" relcode="A" fullname="x" /><person id="3" rel="Сын" relcode="S" fullname="x" /></nearest></person>
<person id="3" sex="М" fullname="Иванов Олег" fn="Олег" sn="Иванов" bdate="1980" ddate="2020"><nearest><person id="1" rel="Отец" relcode="F" fullname="x" /><person id="2" rel="Мать" relcode="M" fullname="x" /></nearest></person>
</persons><events></events></agelongtree>`;

test("XML Древа Жизни: люди, годы, родители, супруги", () => {
  assert.ok(isAgelongXml(xml));
  const r = parseAgelongXml(xml);
  assert.ok("tree" in r);
  if (!("tree" in r)) return;
  assert.equal(r.tree.people.length, 3);
  const olg = r.tree.people.find((p) => p.id === "x3")!;
  assert.equal(olg.firstName, "Олег");
  assert.equal(olg.birthYear, "1980");
  assert.equal(olg.deathYear, "2020");
  const family = r.tree.unions.find((u) => u.childIds.includes("x3"))!;
  assert.deepEqual([...family.partnerIds].sort(), ["x1", "x2"]);
  assert.equal(r.tree.unions.length, 1, "пара из «Жена/Муж» и родителей ребёнка сливается в один союз");
  assert.ok("error" in parseAgelongXml("<html></html>"));
});
