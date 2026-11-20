import { childTrunk } from "@/lib/tree/trunk";
import { unionWordLower } from "./union-label.ts";
import { NAME_HALF, reposition, type Spot } from "./anchor.ts";
import { yearNum } from "./kinship.ts";
import { assignGenerations } from "./layout.ts";
import type { Person, Union } from "./types.ts";
import { arcTopRoom, familyThemeLines, type FamilyExtras, type ThemeStyle } from "./family-sheet.ts";
import type { AppLayout } from "./layout-engine.ts";

export const FRAME = 86;
export const FRAMES = [
  { src: "./tree/frames/frame-1.webp", hole: 0.42 },
  { src: "./tree/frames/frame-2.webp", hole: 0.32 },
  { src: "./tree/frames/frame-3.webp", hole: 0.36 },
  { src: "./tree/frames/frame-4.webp", hole: 0.42 },
] as const;

const BOX = FRAME * 2;
const CAPTION = 74;
const SPOUSE_GAP = 28;
const UNIT_GAP = 44;
const PAD_X = 48;
const PAD_Y = 96;
const ROW = BOX + CAPTION + 40;

export type CameoNode = { id: string; x: number; y: number };
export type CameoMark = { x: number; y: number; text: string };

export type CameoSheet = {
  /** Далёкие связи и ссылки (пунктир), карточки-ссылки и подписи групп: только у семейной раскладки. */
  far?: FamilyExtras["far"];
  refs?: FamilyExtras["refs"];
  groups?: FamilyExtras["groups"];
  width: number;
  height: number;
  /** Во сколько раз расстояния растянуты относительно «Схемы»: нужно для перетаскивания карточек. */
  scale: number;
  /** Множитель по вертикали (у семейной раскладки отдельный от горизонтального). */
  scaleY?: number;
  nodes: CameoNode[];
  vines: string[];
  marks: CameoMark[];
  title: string;
  kicker: string;
};

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
    const ordered = people.get(a)?.gender === "f" && people.get(b)?.gender === "m" ? [b!, a!] : [a!, b!];
    units.push(ordered);
    for (const id of ordered) left.delete(id);
  }
  for (const id of left) units.push([id]);
  units.sort((a, b) => birth(people, a[0]!) - birth(people, b[0]!));
  return units;
}

function wave(x1: number, x2: number, y: number): string {
  const mid = (x1 + x2) / 2;
  return `M ${x1} ${y} C ${x1 + 16} ${y - 18}, ${mid - 18} ${y - 22}, ${mid} ${y} C ${mid + 18} ${y + 22}, ${x2 - 16} ${y + 18}, ${x2} ${y}`;
}

const STYLE: ThemeStyle = { frame: FRAME, caption: CAPTION, edge: 2, markDy: 8, spouse: (x1, y1, x2, y2) => wave(x1, x2, y1), fan: null };

export function layoutCameo(people: Person[], unions: Union[], focusId: string, flow: "down" | "up" = "down", anchor?: ReadonlyMap<string, Spot>, fam?: AppLayout): CameoSheet {
  const empty: CameoSheet = { width: 720, height: 960, scale: 1, nodes: [], vines: [], marks: [], title: "РОД", kicker: "Книга рода" };
  if (!people.length) return empty;
  const gen = assignGenerations(people, unions);
  const byId = new Map(people.map((p) => [p.id, p]));
  const levels = [...new Set([...gen.values()])].sort((a, b) => a - b);
  const rows = levels.map((level) => rowUnits(people.filter((p) => gen.get(p.id) === level).map((p) => p.id), unions, byId));
  const drafts = rows.map((units) => {
    const spots: { id: string; left: number }[] = [];
    let left = 0;
    for (const unit of units) {
      unit.forEach((id, i) => {
        if (i > 0) left += SPOUSE_GAP;
        spots.push({ id, left });
        left += BOX;
      });
      left += UNIT_GAP;
    }
    return { spots, width: Math.max(BOX, left - UNIT_GAP) };
  });
  let width = Math.max(...drafts.map((row) => row.width)) + PAD_X * 2;
  let height = PAD_Y + Math.max(0, levels.length - 1) * ROW + BOX + CAPTION + 12;
  let scale = 1;
  let scaleY = 1;
  const nodes: CameoNode[] = [];
  levels.forEach((_, index) => {
    const draft = drafts[index];
    if (!draft) return;
    const y = PAD_Y + FRAME + (flow === "up" ? levels.length - 1 - index : index) * ROW;
    const origin = (width - draft.width) / 2;
    for (const spot of draft.spots) nodes.push({ id: spot.id, x: origin + spot.left + FRAME, y });
  });
  let famOk = false;
  if (anchor) {
    const ext = reposition(nodes, anchor, { hw: Math.max(FRAME, NAME_HALF), hh: FRAME + CAPTION / 2 }, { left: PAD_X + FRAME, top: PAD_Y + FRAME + (fam ? arcTopRoom(fam, STYLE) : 0) }, { aniso: Boolean(fam) });
    if (ext) {
      famOk = true;
      scale = ext.scale;
      scaleY = ext.scaleY;
      width = ext.maxX + FRAME + PAD_X;
      height = ext.maxY + FRAME + CAPTION + 12;
    }
  }
  const at = new Map(nodes.map((n) => [n.id, n]));
  const vines: string[] = [];
  const marks: CameoMark[] = [];
  for (const union of unions) {
    const partners = union.partnerIds.map((id) => at.get(id)).filter((n): n is CameoNode => Boolean(n));
    const kids = union.childIds.map((id) => at.get(id)).filter((n): n is CameoNode => Boolean(n));
    if (partners.length === 2) {
      const [a, b] = partners[0]!.x < partners[1]!.x ? [partners[0]!, partners[1]!] : [partners[1]!, partners[0]!];
      const x1 = a.x + FRAME + 2;
      const x2 = b.x - FRAME - 2;
      if (x2 > x1 + 8) {
        vines.push(wave(x1, x2, a.y));
        const word = unionWordLower(union.status);
        marks.push({ x: (a.x + b.x) / 2, y: a.y - 8, text: word });
      }
    }
    if (!partners.length || !kids.length) continue;
    const fromX = partners.reduce((s, n) => s + n.x, 0) / partners.length;
    const upward = kids[0]!.y < partners[0]!.y;
    const fromY = upward ? Math.min(...partners.map((n) => n.y)) - FRAME : Math.max(...partners.map((n) => n.y)) + FRAME + CAPTION;
    const childEdge = upward ? Math.max(...kids.map((kid) => kid.y)) + FRAME + CAPTION : Math.min(...kids.map((kid) => kid.y)) - FRAME;
    const busY = upward ? childEdge + Math.max(10, (fromY - childEdge) * 0.45) : fromY + Math.max(10, (childEdge - fromY) * 0.45);
    const xs = kids.map((kid) => kid.x);
    vines.push(...childTrunk(fromX, fromY, busY, xs));
    for (const kid of kids) vines.push(`M ${kid.x} ${busY} V ${upward ? kid.y + FRAME + CAPTION : kid.y - FRAME}`);
  }
  let extras: FamilyExtras = { far: [], refs: [], groups: [] };
  if (fam && famOk) {
    const L = familyThemeLines(fam, nodes, scale, scaleY, STYLE, flow);
    vines.length = 0;
    vines.push(...L.vines);
    marks.length = 0;
    marks.push(...L.marks);
    extras = { far: L.far, refs: L.refs, groups: L.groups };
    for (const r of L.refs) {
      width = Math.max(width, r.x + FRAME + PAD_X);
      height = Math.max(height, r.y + FRAME + CAPTION + 12);
    }
    for (const g of L.groups) height = Math.max(height, g.y + 40);
  }
  const focus = byId.get(focusId);
  return { ...(fam && famOk ? extras : {}), width, height, scale, scaleY, nodes, vines, marks, title: (focus?.lastName || "Род").toLocaleUpperCase("ru"), kicker: "Книга рода" };
}
