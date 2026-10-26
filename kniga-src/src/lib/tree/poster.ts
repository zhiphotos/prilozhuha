import { assignGenerations } from "./layout.ts";
import { displayName, kinship, yearNum, yearsOf } from "./kinship.ts";
import type { Person, Union } from "./types.ts";

export type PosterNode = { id: string; x: number; y: number; gen: number; w: number };

export type PosterSheet = {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  nodes: PosterNode[];
  links: string[];
  rings: { x: number; y: number }[];
  title: string;
  titleX: number;
  titleY: number;
};

const CARD_H = 64;
const SHEET_W = 1152;
const SHEET_H = 1728;

const SILHOUETTE: [number, number, number][] = [
  [0.12, 0.36, 0.64],
  [0.2, 0.2, 0.78],
  [0.3, 0.16, 0.84],
  [0.4, 0.1, 0.9],
  [0.5, 0.14, 0.84],
  [0.55, 0.22, 0.78],
  [0.76, 0.3, 0.72],
  [0.84, 0.24, 0.78],
  [0.9, 0.36, 0.66],
];

function spanAt(yFrac: number): [number, number] {
  let prev = SILHOUETTE[0]!;
  for (const row of SILHOUETTE) {
    if (yFrac <= row[0]) {
      const t = row[0] === prev[0] ? 0 : (yFrac - prev[0]) / (row[0] - prev[0]);
      return [prev[1] + (row[1] - prev[1]) * t, prev[2] + (row[2] - prev[2]) * t];
    }
    prev = row;
  }
  return [prev[1], prev[2]];
}

function yFracFor(index: number, count: number): number {
  if (count <= 1) return 0.42;
  const roots = Math.max(1, Math.min(count - 1, Math.round(count * 0.34)));
  if (index < roots) {
    const t = roots === 1 ? 0.5 : index / (roots - 1);
    return 0.9 - t * 0.14;
  }
  const canopy = count - roots;
  const t = canopy === 1 ? 0.45 : (index - roots) / (canopy - 1);
  return 0.52 - t * 0.38;
}

function cardWidthFor(person: Person, people: Person[], unions: Union[], focusId: string) {
  const name = displayName(person);
  const role = kinship(people, unions, focusId, person.id).card;
  const years = yearsOf(person);
  const longest = Math.max(name.length, role.length, years ? years.length + 2 : 0);
  return Math.min(320, Math.max(200, Math.round(longest * 7.8 + 68)));
}

function birth(people: Map<string, Person>, id: string): number {
  return yearNum(people.get(id)?.birthYear);
}

function rowUnits(ids: string[], unions: Union[], people: Map<string, Person>): string[][] {
  const left = new Set(ids);
  const units: string[][] = [];
  for (const union of unions) {
    const pair = union.partnerIds.filter((id) => left.has(id));
    if (pair.length < 2) continue;
    const [a, b] = pair;
    const ga = people.get(a)?.gender;
    const gb = people.get(b)?.gender;
    const ordered = ga === "f" && gb === "m" ? [b!, a!] : [a!, b!];
    units.push(ordered);
    for (const id of ordered) left.delete(id);
  }
  for (const id of left) units.push([id]);
  units.sort((a, b) => birth(people, a[0]!) - birth(people, b[0]!));
  return units;
}

export function layoutPoster(people: Person[], unions: Union[], focusId: string, flow: "down" | "up" = "down"): PosterSheet {
  const empty = { width: SHEET_W, height: SHEET_H, cardW: 160, cardH: CARD_H, nodes: [] as PosterNode[], links: [] as string[], rings: [] as { x: number; y: number }[], title: "РОД", titleX: SHEET_W / 2, titleY: SHEET_H * 0.64 };
  if (!people.length) return empty;
  const gen = assignGenerations(people, unions);
  const byId = new Map(people.map((p) => [p.id, p]));
  const levels = [...new Set([...gen.values()])].sort((a, b) => a - b);
  const rows = levels.map((level) => rowUnits(people.filter((p) => gen.get(p.id) === level).map((p) => p.id), unions, byId));
  const measured = rows.map((units) => {
    const spots: { id: string; left: number; w: number }[] = [];
    let left = 0;
    for (const unit of units) {
      unit.forEach((id, i) => {
        if (i > 0) left += 16;
        const w = cardWidthFor(byId.get(id)!, people, unions, focusId);
        spots.push({ id, left, w });
        left += w + 10;
      });
    }
    return { spots, total: Math.max(120, left - 10) };
  });
  const width = Math.max(SHEET_W, ...measured.map((row) => row.total + 160));
  const height = Math.round(width * (SHEET_H / SHEET_W));
  const nodes: PosterNode[] = [];
  measured.forEach((row, index) => {
    const slot = flow === "up" ? levels.length - 1 - index : index;
    const y = yFracFor(slot, levels.length) * height;
    const origin = (width - row.total) / 2;
    for (const spot of row.spots) nodes.push({ id: spot.id, x: origin + spot.left + spot.w / 2, y, gen: levels[index] ?? 0, w: spot.w });
  });
  const at = new Map(nodes.map((n) => [n.id, n]));
  const links: string[] = [];
  const rings: { x: number; y: number }[] = [];
  for (const union of unions) {
    const partners = union.partnerIds.map((id) => at.get(id)).filter((n): n is PosterNode => Boolean(n));
    const kids = union.childIds.map((id) => at.get(id)).filter((n): n is PosterNode => Boolean(n));
    if (partners.length === 2) {
      const [a, b] = partners[0]!.x < partners[1]!.x ? [partners[0]!, partners[1]!] : [partners[1]!, partners[0]!];
      const y = (a.y + b.y) / 2;
      const x1 = a.x + a.w / 2;
      const x2 = b.x - b.w / 2;
      if (x2 > x1 + 10) {
        links.push(`M ${x1} ${y} H ${x2}`);
        rings.push({ x: (x1 + x2) / 2, y });
      }
    }
    if (!partners.length || !kids.length) continue;
    const upward = kids[0]!.y < partners[0]!.y;
    const fromX = partners.reduce((s, n) => s + n.x, 0) / partners.length;
    const fromY = upward ? Math.min(...partners.map((n) => n.y)) - CARD_H / 2 : Math.max(...partners.map((n) => n.y)) + CARD_H / 2;
    const edge = upward ? Math.max(...kids.map((k) => k.y)) + CARD_H / 2 : Math.min(...kids.map((k) => k.y)) - CARD_H / 2;
    const busY = upward ? edge + (fromY - edge) * 0.35 : fromY + 16;
    const xs = [fromX, ...kids.map((k) => k.x)];
    links.push(`M ${fromX} ${fromY} V ${busY}`);
    links.push(`M ${Math.min(...xs)} ${busY} H ${Math.max(...xs)}`);
    for (const kid of kids) links.push(`M ${kid.x} ${busY} V ${upward ? kid.y + CARD_H / 2 : kid.y - CARD_H / 2}`);
  }
  const focus = byId.get(focusId);
  const title = (focus?.lastName || "РОД").toLocaleUpperCase("ru");
  let titleY = height * 0.64;
  if (nodes.some((n) => Math.abs(n.x - width / 2) < n.w * 0.6 && Math.abs(n.y - titleY) < CARD_H)) titleY = height * 0.68;
  const cardW = nodes.reduce((m, n) => Math.max(m, n.w), 120);
  return { width, height, cardW, cardH: CARD_H, nodes, links, rings, title, titleX: width / 2, titleY };
}
