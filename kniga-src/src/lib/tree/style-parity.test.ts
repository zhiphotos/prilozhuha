import assert from "node:assert/strict";
import test from "node:test";
import { NAME_HALF } from "./anchor.ts";
import { layoutBoheme } from "./boheme.ts";
import { layoutCameo } from "./cameo.ts";
import { demoTree } from "./demo.ts";
import { layoutGzhel } from "./gzhel.ts";
import { praPrefix } from "./kinship.ts";
import { schemeAnchor } from "./scheme.ts";
import { layoutTaiga } from "./taiga.ts";

const layouts = { cameo: layoutCameo, gzhel: layoutGzhel, boheme: layoutBoheme, taiga: layoutTaiga } as const;

for (const [name, layout] of Object.entries(layouts)) {
  test(`${name}: подписи соседей в одном ряду не наезжают друг на друга`, () => {
    const data = demoTree();
    const anchor = schemeAnchor(data.people, data.unions, data.focusId);
    const sheet = layout(data.people, data.unions, data.focusId, "down", anchor);
    assert.equal(sheet.nodes.length, data.people.length);
    for (let i = 0; i < sheet.nodes.length; i += 1) {
      for (let j = i + 1; j < sheet.nodes.length; j += 1) {
        const a = sheet.nodes[i]!;
        const b = sheet.nodes[j]!;
        if (Math.abs(a.y - b.y) < 1) assert.ok(Math.abs(a.x - b.x) >= NAME_HALF * 2 - 1, `${a.id} и ${b.id}: подписи сливаются`);
      }
    }
  });

  test(`${name}: места как на «Схеме», с одним общим множителем`, () => {
    const data = demoTree();
    const anchor = schemeAnchor(data.people, data.unions, data.focusId);
    const sheet = layout(data.people, data.unions, data.focusId, "down", anchor);
    assert.ok(sheet.scale > 0);
    const first = sheet.nodes[0]!;
    for (const node of sheet.nodes.slice(1)) {
      const ax = anchor.get(node.id)!.x - anchor.get(first.id)!.x;
      const ay = anchor.get(node.id)!.y - anchor.get(first.id)!.y;
      assert.ok(Math.abs(node.x - first.x - ax * sheet.scale) < 0.5, `${node.id}: положение по горизонтали не как на схеме`);
      assert.ok(Math.abs(node.y - first.y - ay * sheet.scale) < 0.5, `${node.id}: положение по вертикали не как на схеме`);
    }
  });
}

test("«пра»: до четырёх пишем словом, дальше числом в верхнем индексе", () => {
  assert.equal(praPrefix(1), "пра");
  assert.equal(praPrefix(4), "прапрапрапра");
  assert.equal(praPrefix(5), "пра⁵");
  assert.equal(praPrefix(6), "пра⁶");
  assert.equal(praPrefix(12), "пра¹²");
  assert.equal(praPrefix(6, " "), "пра⁶", "пробела между «пра⁶» и «дедушка» нет");
  assert.equal(praPrefix(0), "");
});

test("подпись родства: номер поколения не дублируется", async () => {
  const { kinship } = await import("./kinship.ts");
  const person = (id: string, gender: "m" | "f") => ({ id, firstName: id, patronymic: "", lastName: "", gender, birthYear: "", deathYear: "" });
  // цепочка из 8 человек вверх: p1 – родитель p0, p2 – родитель p1 и так далее
  const people = Array.from({ length: 8 }, (_, i) => person("p" + i, i % 2 ? "f" : "m")) as never[];
  const unions = Array.from({ length: 7 }, (_, i) => ({ id: "u" + i, partnerIds: ["p" + (i + 1)], childIds: ["p" + i], status: "married", startYear: "", endYear: "" })) as never[];
  const card = (id: string) => kinship(people, unions, "p0", id).card;
  assert.match(card("p5"), /^Прапрапра(дедушка|бабушка) \(5\)$/, "до четырёх «пра» номер поколения остаётся: " + card("p5"));
  assert.match(card("p7"), /^Пра⁵(дедушка|бабушка)$/, "дальше число в верхнем индексе, без скобок: " + card("p7"));
});
