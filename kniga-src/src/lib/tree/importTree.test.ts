import assert from "node:assert/strict";
import test from "node:test";
import { parseGedcom, treeFromExtract } from "./importTree.ts";

test("gedcom keeps spouses side by side and children under them", () => {
  const ged = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Иван Петрович /Волков/
1 SEX M
1 BIRT
2 DATE 12 MAR 1920
0 @I2@ INDI
1 NAME Мария /Соколова/
1 SEX F
0 @I3@ INDI
1 NAME Анна /Волкова/
1 SEX F
1 BIRT
2 DATE 1948
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 MARR
2 DATE 1942
1 DIV
2 DATE 1955
0 TRLR`;
  const result = parseGedcom(ged);
  assert.equal("error" in result, false);
  if ("error" in result) return;
  assert.equal(result.tree.people.length, 3);
  const ivan = result.tree.people.find((p) => p.firstName === "Иван");
  assert.equal(ivan?.patronymic, "Петрович");
  assert.equal(ivan?.birthYear, "12.03.1920");
  assert.equal(result.tree.unions[0]?.partnerIds.length, 2);
  assert.deepEqual(result.tree.unions[0]?.childIds, ["I3"]);
  assert.equal(result.tree.unions[0]?.status, "divorced");
  assert.equal(result.tree.unions[0]?.startYear, "1942");
});

test("a hundred people survive the transfer", () => {
  const lines = ["0 HEAD", "1 CHAR UTF-8"];
  for (let i = 1; i <= 100; i++) lines.push(`0 @I${i}@ INDI`, `1 NAME Человек${i} /Родов/`, `1 SEX ${i % 2 ? "M" : "F"}`);
  for (let f = 0; f < 25; f++) {
    const h = f * 4 + 1;
    lines.push(`0 @F${f}@ FAM`, `1 HUSB @I${h}@`, `1 WIFE @I${h + 1}@`, `1 CHIL @I${h + 2}@`, `1 CHIL @I${h + 3}@`);
  }
  const result = parseGedcom(lines.join("\n"));
  assert.equal("error" in result, false);
  if ("error" in result) return;
  assert.equal(result.tree.people.length, 100);
  assert.equal(result.tree.unions.length, 25);
  assert.equal(result.tree.unions[0]?.childIds.length, 2);
});

test("ai json drops invented blank rows", () => {
  const result = treeFromExtract({
    people: [
      { id: "p1", firstName: "Анна", gender: "f" },
      { id: "p2", firstName: "", lastName: "" },
    ],
    unions: [{ partnerIds: ["p1", "missing"], childIds: ["p2"] }],
    focusId: "p1",
  });
  assert.equal("error" in result, false);
  if ("error" in result) return;
  assert.equal(result.tree.people.length, 1);
  assert.equal(result.tree.unions.length, 0);
  assert.equal(result.tree.focusId, "p1");
});
