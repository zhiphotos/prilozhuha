/**
 * Линия от пары родителей к детям: вниз от брака, затем в середину перекладины между детьми, и от неё к каждому.
 * Раньше линия падала на ближайшего ребёнка, а остальные отходили от него вбок, и казалось, что брат растёт от сестры.
 */
export function childTrunk(fromX: number, fromY: number, busY: number, xs: number[]): string[] {
  if (!xs.length) return [];
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  if (xs.length === 1) return [`M ${fromX} ${fromY} V ${busY}`, ...(Math.abs(fromX - min) > 1 ? [`M ${fromX} ${busY} H ${min}`] : [])];
  const cx = (min + max) / 2;
  const bar = `M ${min} ${busY} H ${max}`;
  if (Math.abs(fromX - cx) <= 1) return [`M ${fromX} ${fromY} V ${busY}`, bar];
  const midY = fromY + (busY - fromY) * 0.5;
  return [`M ${fromX} ${fromY} V ${midY} H ${cx} V ${busY}`, bar];
}
