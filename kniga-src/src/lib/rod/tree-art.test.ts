import assert from "node:assert/strict";
import test from "node:test";
import { TREE_KINDS, TREE_VIEW, buildTree, hash01 } from "./tree-art.ts";

const drawn = TREE_KINDS;

test("хэш стабилен и в диапазоне", () => {
  assert.equal(hash01("a.b", 3), hash01("a.b", 3));
  for (let i = 0; i < 50; i++) {
    const v = hash01(`k${i}`, i);
    assert.ok(v >= 0 && v < 1);
  }
});

test("семечко почти без веток, полное дерево с кроной", () => {
  for (const k of drawn) {
    const seed = buildTree(k.id, 0);
    const full = buildTree(k.id, 1);
    assert.equal(seed.segs.length, 0, `${k.id}: на нуле ничего не нарисовано`);
    assert.ok(full.segs.length > 30, `${k.id}: у полного дерева много ветвей`);
    assert.ok(full.leaves.length > 40, `${k.id}: у полного дерева крона`);
  }
});

test("рост только вперёд: веток, листьев и высоты не становится меньше", () => {
  for (const k of drawn) {
    let segs = 0, leaves = 0, height = 0;
    for (let i = 0; i <= 100; i++) {
      const s = buildTree(k.id, i / 100);
      assert.ok(s.segs.length >= segs, `${k.id} ветки на ${i}%`);
      assert.ok(s.leaves.length >= leaves, `${k.id} листья на ${i}%`);
      assert.ok(s.height >= height - 0.001, `${k.id} высота на ${i}%`);
      segs = s.segs.length; leaves = s.leaves.length; height = s.height;
    }
  }
});

test("всё нарисованное в границах листа", () => {
  for (const k of drawn) {
    const s = buildTree(k.id, 1);
    for (const l of s.leaves) {
      assert.ok(l.x > -8 && l.x < TREE_VIEW.w + 8 && l.y > -8 && l.y < TREE_VIEW.h, `${k.id} лист вне листа: ${l.x},${l.y}`);
    }
    assert.ok(s.height > TREE_VIEW.h * 0.6, `${k.id}: дерево занимает почти всю высоту (${s.height})`);
  }
});

test("уже выросшие ветки не меняются при росте", () => {
  const a = buildTree("oak", 0.5);
  const b = buildTree("oak", 0.9);
  assert.equal(a.segs[0]!.d.split(" ")[0], b.segs[0]!.d.split(" ")[0], "основание ствола на месте");
});
