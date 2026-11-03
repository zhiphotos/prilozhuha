// Направляющие и прилипание при перетаскивании: центр страницы, края и центры других блоков, первый текст страницы в приоритете.
export type Rect = { x: number; y: number; w: number; h: number };
export type SnapTarget = Rect & { first?: boolean };
export type Guides = { v: number[]; h: number[] };
export type SnapResult = { x: number; y: number; guides: Guides };

const lines = (r: Rect, axis: "x" | "y") => (axis === "x" ? [r.x, r.x + r.w / 2, r.x + r.w] : [r.y, r.y + r.h / 2, r.y + r.h]);

/** Подвинуть рамку к ближайшим линиям: у каждой оси берётся ближайшая пара «линия блока – линия цели» не дальше threshold (в % страницы).
 * page: размеры страницы в тех же единицах (центр страницы всегда цель). Первый текст при равенстве расстояний выигрывает. */
export function snapBox(box: Rect, targets: SnapTarget[], page: { w: number; h: number }, threshold = 1.2): SnapResult {
  const pick = (axis: "x" | "y"): { shift: number; at: number } | null => {
    const size = axis === "x" ? page.w : page.h;
    const cands: { at: number; first: boolean }[] = [{ at: size / 2, first: false }];
    for (const t of targets) for (const at of lines(t, axis)) cands.push({ at, first: Boolean(t.first) });
    let best: { shift: number; at: number; first: boolean } | null = null;
    for (const own of lines(box, axis)) {
      for (const c of cands) {
        const shift = c.at - own;
        const d = Math.abs(shift);
        if (d > threshold) continue;
        if (!best || d < Math.abs(best.shift) - 1e-9 || (Math.abs(Math.abs(shift) - Math.abs(best.shift)) < 1e-9 && c.first && !best.first)) best = { shift, at: c.at, first: c.first };
      }
    }
    return best;
  };
  const sx = pick("x");
  const sy = pick("y");
  return { x: box.x + (sx?.shift ?? 0), y: box.y + (sy?.shift ?? 0), guides: { v: sx ? [sx.at] : [], h: sy ? [sy.at] : [] } };
}
