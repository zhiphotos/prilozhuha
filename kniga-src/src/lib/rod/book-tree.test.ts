import assert from "node:assert/strict";
import test from "node:test";
import { TREE_STAGES, treeGrowth } from "./book-tree.ts";

test("пустая книга: семя, шкала на нуле", () => {
  const g = treeGrowth(0, 0);
  assert.equal(g.stage, 0);
  assert.equal(g.progress, 0);
});

test("дерево только растёт: с ростом заполненности и страниц стадия не падает", () => {
  let last = 0;
  for (let pages = 0; pages <= 40; pages += 2) {
    for (let overall = 0; overall <= 100; overall += 5) {
      const g = treeGrowth(overall, pages);
      assert.ok(g.stage >= 0 && g.stage < TREE_STAGES.length);
      assert.ok(g.progress >= 0 && g.progress <= 1);
    }
    const s = treeGrowth(50, pages).stage;
    assert.ok(s >= last, "страниц больше, стадия не ниже");
    last = s;
  }
});

test("полная книга: последняя стадия, шкала полная", () => {
  const g = treeGrowth(100, 60);
  assert.equal(g.stage, TREE_STAGES.length - 1);
  assert.equal(g.progress, 1);
});

test("все шесть стадий достижимы", () => {
  const seen = new Set<number>();
  for (let s = 0; s <= 100; s += 1) seen.add(treeGrowth(s, 0).stage);
  for (let s = 0; s <= 100; s += 1) seen.add(treeGrowth(100, (s / 100) * 30).stage);
  assert.equal(seen.size, TREE_STAGES.length);
});

test("плохие числа не ломают расчёт", () => {
  assert.equal(treeGrowth(Number.NaN, -5).stage, 0);
});

test("ширина дерева только растёт, не больше блока, маленькие деревья не заходят за кнопки", async () => {
  const { levelWidth, levelFile, SMALL_TREE_MAX } = await import("./book-tree.ts");
  let last = 0;
  for (let score = 0; score <= 100; score += 1) {
    const g = treeGrowth(score, 0);
    const w = levelWidth(g.stage, g.progress);
    assert.ok(w >= last - 1e-9, `ширина на ${score}`);
    assert.ok(w <= 1 + 1e-9);
    if (g.stage <= 2) assert.ok(w <= SMALL_TREE_MAX + 1e-9, `на уровне ${g.stage + 1} дерево остаётся слева`);
    last = w;
  }
  assert.equal(levelWidth(5, 1), levelWidth(5, 0), "у последнего уровня размер не меняется");
  assert.ok(levelWidth(5, 1) >= 0.75, "взрослое дерево заходит за кнопки");
  assert.equal(levelFile(0), "seed");
  assert.equal(levelFile(1), "sprout");
  assert.equal(levelFile(5), "full");
});

test("на первых двух уровнях видны только семя и росток", async () => {
  const { levelFile } = await import("./book-tree.ts");
  assert.ok(["seed", "sprout"].includes(levelFile(0)) && ["seed", "sprout"].includes(levelFile(1)));
});
