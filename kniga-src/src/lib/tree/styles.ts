import type { ChildBus, SpouseLink } from "./types.ts";

export type TreeStyle = "work" | "carved" | "cameo" | "gzhel" | "boheme" | "taiga";

export type Motif = { x: number; y: number; s: number; rot: number; kind: "flower" | "leaf" };

export const CARVED_RX = 72;
export const CARVED_RY = 28;
const OVAL_DY = 16;

function mulberry32(seed: number) {
  let a = seed || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function motifs(width: number, height: number): Motif[] {
  const rand = mulberry32(Math.round(width + height * 17));
  const count = Math.min(90, Math.max(18, Math.round((width * height) / 90000)));
  const out: Motif[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: rand() * width,
      y: rand() * height,
      s: 3.4 + rand() * 3.2,
      rot: rand() * 360,
      kind: rand() > 0.55 ? "flower" : "leaf",
    });
  }
  return out;
}

export function carvedBusPath(bus: ChildBus): string {
  const parentBottom = bus.fromY != null ? bus.fromY - 86 : bus.busY;
  const childTop = bus.childTop + 34;
  const parts: string[] = [];
  if (bus.fromX != null) parts.push(`M ${bus.fromX} ${parentBottom} V ${bus.busY}`);
  if (bus.xs.length > 1) {
    const min = bus.xs[0];
    const max = bus.xs[bus.xs.length - 1];
    if (min != null && max != null) parts.push(`M ${min} ${bus.busY} H ${max}`);
  }
  for (const x of bus.xs) parts.push(`M ${x} ${bus.busY} V ${childTop}`);
  return parts.join(" ");
}

export function carvedSpousePath(link: SpouseLink): string {
  const y1 = link.y1 + OVAL_DY;
  const y2 = link.y2 + OVAL_DY;
  const dir = Math.sign(link.x2 - link.x1) || 1;
  const x1 = link.x1 + dir * (CARVED_RX + 4);
  const x2 = link.x2 - dir * (CARVED_RX + 4);
  if (!link.curved) return `M ${x1} ${y1} H ${x2}`;
  const mx = (x1 + x2) / 2;
  const my = Math.min(y1, y2) - 36;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

export function carvedPill(link: SpouseLink): { x: number; y: number } {
  return { x: (link.x1 + link.x2) / 2, y: (link.curved ? Math.min(link.y1, link.y2) - 18 : link.y1) + OVAL_DY };
}
