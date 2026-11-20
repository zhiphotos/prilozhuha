import { NAME_HALF, reposition, type Spot } from "./anchor.ts";
import { unionWordLower } from "./union-label.ts";
import { yearNum } from "./kinship.ts";
import { assignGenerations } from "./layout.ts";
import type { Person, Union } from "./types.ts";
import { arcTopRoom, familyThemeLines, type FamilyExtras, type ThemeStyle } from "./family-sheet.ts";
import type { AppLayout } from "./layout-engine.ts";

export const BOHEME_FRAME = 96;
export const BOHEME_FRAMES = [
  { src: "./tree/boheme/frame-1.webp", hole: 0.44 },
  { src: "./tree/boheme/frame-2.webp", hole: 0.5 },
  { src: "./tree/boheme/frame-3.webp", hole: 0.36 },
  { src: "./tree/boheme/frame-4.webp", hole: 0.42 },
] as const;

const BOX = BOHEME_FRAME * 2;
const CAPTION = 72;
const SPOUSE_GAP = 32;
const UNIT_GAP = 48;
const PAD_X = 64;
const PAD_Y = 108;
const ROW = BOX + CAPTION + 44;

export type BohemeNode = { id: string; x: number; y: number };
export type BohemeMark = { x: number; y: number; text: string };
export type BohemeSheet = {
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
  nodes: BohemeNode[];
  vines: string[];
  marks: BohemeMark[];
  title: string;
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

function vine(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return `M ${x1} ${y1} C ${x1 + dx * 0.12} ${y1 + dy * 0.46}, ${x2 - dx * 0.12} ${y1 + dy * 0.54}, ${x2} ${y2}`;
}

const STYLE: ThemeStyle = { frame: BOHEME_FRAME, caption: CAPTION, edge: 4, markDy: 10, spouse: (x1, y1, x2, y2) => vine(x1, y1, x2, y2), fan: vine };

export function layoutBoheme(people: Person[], unions: Union[], focusId: string, flow: "down" | "up" = "down", anchor?: ReadonlyMap<string, Spot>, fam?: AppLayout): BohemeSheet {
  const empty: BohemeSheet = { width: 720, height: 980, scale: 1, nodes: [], vines: [], marks: [], title: "РОД" };
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
  let height = PAD_Y + Math.max(0, levels.length - 1) * ROW + BOX + CAPTION + 16;
  let scale = 1;
  let scaleY = 1;
  const nodes: BohemeNode[] = [];
  levels.forEach((_, index) => {
    const draft = drafts[index];
    if (!draft) return;
    const y = PAD_Y + BOHEME_FRAME + (flow === "up" ? levels.length - 1 - index : index) * ROW;
    const origin = (width - draft.width) / 2;
    for (const spot of draft.spots) nodes.push({ id: spot.id, x: origin + spot.left + BOHEME_FRAME, y });
  });
  let famOk = false;
  if (anchor) {
    const ext = reposition(nodes, anchor, { hw: Math.max(BOHEME_FRAME, NAME_HALF), hh: BOHEME_FRAME + CAPTION / 2 }, { left: PAD_X + BOHEME_FRAME, top: PAD_Y + BOHEME_FRAME + (fam ? arcTopRoom(fam, STYLE) : 0) }, { aniso: Boolean(fam) });
    if (ext) {
      famOk = true;
      scale = ext.scale;
      scaleY = ext.scaleY;
      width = ext.maxX + BOHEME_FRAME + PAD_X;
      height = ext.maxY + BOHEME_FRAME + CAPTION + 16;
    }
  }
  const at = new Map(nodes.map((n) => [n.id, n]));
  const vines: string[] = [];
  const marks: BohemeMark[] = [];
  for (const union of unions) {
    const partners = union.partnerIds.map((id) => at.get(id)).filter((n): n is BohemeNode => Boolean(n));
    const kids = union.childIds.map((id) => at.get(id)).filter((n): n is BohemeNode => Boolean(n));
    if (partners.length === 2) {
      const [a, b] = partners[0]!.x < partners[1]!.x ? [partners[0]!, partners[1]!] : [partners[1]!, partners[0]!];
      const x1 = a.x + BOHEME_FRAME + 4;
      const x2 = b.x - BOHEME_FRAME - 4;
      if (x2 > x1 + 8) {
        vines.push(vine(x1, a.y, x2, b.y));
        const word = unionWordLower(union.status);
        marks.push({ x: (a.x + b.x) / 2, y: a.y - 10, text: word });
      }
    }
    if (!partners.length || !kids.length) continue;
    const upward = kids[0]!.y < partners[0]!.y;
    const fromX = partners.reduce((s, n) => s + n.x, 0) / partners.length;
    const fromY = upward ? Math.min(...partners.map((n) => n.y)) - BOHEME_FRAME : Math.max(...partners.map((n) => n.y)) + BOHEME_FRAME + CAPTION;
    for (const kid of kids) vines.push(vine(fromX, fromY, kid.x, upward ? kid.y + BOHEME_FRAME + CAPTION : kid.y - BOHEME_FRAME));
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
      width = Math.max(width, r.x + BOHEME_FRAME + PAD_X);
      height = Math.max(height, r.y + BOHEME_FRAME + CAPTION + 12);
    }
    for (const g of L.groups) height = Math.max(height, g.y + 40);
  }
  const focus = byId.get(focusId);
  return { ...(fam && famOk ? extras : {}), width, height, scale, scaleY, nodes, vines, marks, title: (focus?.lastName || "Род").toLocaleUpperCase("ru") };
}
