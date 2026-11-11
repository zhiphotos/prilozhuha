// Во всех стилях древа карточки стоят там же, где на «Схеме» (вместе с ручными сдвигами): схему можно подобрать один раз и переодеть в любой стиль.
export type Spot = { x: number; y: number };

/** Ставит карточки стиля по местам «Схемы». Расстояния растягиваются или сжимаются одним общим множителем, чтобы карточки не налезали друг на друга и расположение осталось тем же.
 * Левый верхний угол занимаемой области ставится в (left, top). Возвращает правый и нижний край центров карточек или null, если кого-то нет на «Схеме» (тогда ничего не меняется). */
export function reposition<N extends { id: string; x: number; y: number }>(
  nodes: N[],
  anchor: ReadonlyMap<string, Spot>,
  size: { hw: number | ((n: N) => number); hh: number },
  place: { left: number; top: number },
): { maxX: number; maxY: number } | null {
  if (!nodes.length || nodes.some((n) => !anchor.has(n.id))) return null;
  const half = (n: N) => (typeof size.hw === "function" ? size.hw(n) : size.hw);
  const gap = 10;
  let need = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = anchor.get(nodes[i]!.id)!;
      const b = anchor.get(nodes[j]!.id)!;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const sx = dx > 0 ? (half(nodes[i]!) + half(nodes[j]!) + gap) / dx : Infinity;
      const sy = dy > 0 ? (size.hh * 2 + gap) / dy : Infinity;
      const pair = Math.min(sx, sy);
      if (Number.isFinite(pair) && pair > need) need = pair;
    }
  }
  const s = Math.min(3, Math.max(0.35, need || 1));
  const minX = Math.min(...nodes.map((n) => anchor.get(n.id)!.x));
  const minY = Math.min(...nodes.map((n) => anchor.get(n.id)!.y));
  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    const p = anchor.get(n.id)!;
    n.x = place.left + (p.x - minX) * s;
    n.y = place.top + (p.y - minY) * s;
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  return { maxX, maxY };
}
