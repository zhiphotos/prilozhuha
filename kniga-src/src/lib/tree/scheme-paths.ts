// Контуры линий экрана «Схема»: что именно рисует TreeStage. Вынесено из компонента, чтобы отображение можно было проверять тестами.
// Для раскладки `classic` результат тот же, что был в компоненте до этапа 4.2 (проверяется в scheme-paths.test.ts).
import { busIsFar, FAR_LINK, hoppedH } from "./bus-look.ts";
import { PORTRAIT_R } from "./metrics.ts";
import { childTrunk } from "./trunk.ts";
import type { ChildBus, SpouseLink } from "./types.ts";

/** Дополнительные поля раскладки `family`. */
export type SchemeBus = ChildBus & { dropXs?: number[]; jogY?: (number | null)[]; far?: boolean };
export type SchemeSpouse = SpouseLink & { arcH?: number; pillT?: number; /** Куда идёт дуга от плашки: 1 вправо, -1 влево (на плашке стрелка в эту сторону). */ pillDir?: 1 | -1; /** Длинная дуга выходит с макушки портрета (а не сбоку), чтобы плашка у начала дуги явно относилась к своей карточке. */ arcTop?: boolean };

export { FAR_LINK, busIsFar };

/** Вход в ребёнка. Если вход сдвинут в сторону (чтобы не лечь на чужую вертикаль), линия подходит со сдвигом и у самого портрета делает короткое колено. */
function dropPath(bus: SchemeBus, i: number): string {
  const x = bus.xs[i]!;
  const top = bus.childTops?.[i] ?? bus.childTop;
  const dx = bus.dropXs?.[i] ?? x;
  if (Math.abs(dx - x) < 1) return `M ${x} ${bus.busY} V ${top}`;
  const jog = bus.jogY?.[i] ?? (top < bus.busY ? top + 16 : top - 16);
  return `M ${dx} ${bus.busY} V ${jog} H ${x} V ${top}`;
}

/** `hops`: x-координаты, где перекладина перепрыгивает чужую вертикаль (только `family`). */
export function busPath(bus: SchemeBus, hops?: number[]): string {
  const parts: string[] = [];
  const min = bus.xs[0];
  const max = bus.xs[bus.xs.length - 1];
  const far = busIsFar(bus);
  const hop = (d: string) => {
    if (!hops?.length) return d;
    const m = /^M (\S+) (\S+) H (\S+)$/.exec(d);
    return m ? hoppedH(Number(m[1]), Number(m[3]), Number(m[2]), hops) : d;
  };
  const drops = bus.dropXs ?? bus.xs;
  let trunked = false;
  if (!far && bus.fromX != null && bus.fromY != null && min != null && max != null) {
    if (bus.partnerXs && bus.partnerTop != null && bus.bracketY !== undefined) {
      parts.push(`M ${bus.fromX} ${bus.fromY} V ${bus.busY}`);
      if (bus.fromX < min - 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${min}`);
      else if (bus.fromX > max + 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${max}`);
    } else {
      parts.push(...childTrunk(bus.fromX, bus.fromY, bus.busY, drops).map(hop));
      trunked = true;
    }
  }
  if (bus.partnerXs && bus.partnerTop != null && bus.bracketY !== undefined) {
    // Брак между далёкими супругами: от каждого вниз и общая линия; от её середины вниз к детям, там разветвление.
    for (const x of bus.partnerXs) parts.push(`M ${x} ${bus.partnerTop} V ${bus.bracketY}`);
    parts.push(`M ${Math.min(...bus.partnerXs)} ${bus.bracketY} H ${Math.max(...bus.partnerXs)}`);
    const mid = bus.fromX ?? (bus.partnerXs[0]! + bus.partnerXs[1]!) / 2;
    parts.push(`M ${mid} ${bus.bracketY} V ${bus.busY}`);
    parts.push(`M ${Math.min(mid, ...bus.xs)} ${bus.busY} H ${Math.max(mid, ...bus.xs)}`);
  } else if (!trunked && min != null && max != null && bus.xs.length > 1) parts.push(hop(`M ${Math.min(...drops)} ${bus.busY} H ${Math.max(...drops)}`));
  bus.xs.forEach((_, i) => parts.push(dropPath(bus, i)));
  return parts.join(" ");
}

/** Дальняя связь от родителей к детям: от брака вниз и вбок к ближайшему ребёнку. */
export function busLinkPath(bus: SchemeBus): string {
  if (!busIsFar(bus)) return "";
  const min = bus.dropXs ? Math.min(...bus.dropXs) : bus.xs[0]!;
  const max = bus.dropXs ? Math.max(...bus.dropXs) : bus.xs[bus.xs.length - 1]!;
  const to = bus.fromX! < min ? min : max;
  return `M ${bus.fromX} ${bus.fromY} V ${bus.busY} H ${to}`;
}

/** Высота контрольной точки дуги над линией брака. Без `arcH` (classic) прежние 58. */
function arcControlY(link: SchemeSpouse): number {
  return Math.min(link.y1, link.y2) - (link.arcH !== undefined ? 2 * link.arcH : 58);
}

/** Начало и конец дуги по вертикали: с макушки портрета у `arcTop`, иначе на линии брака. */
function arcEnds(link: SchemeSpouse): { y1: number; y2: number } {
  const lift = link.arcTop ? PORTRAIT_R + 2 : 0;
  return { y1: link.y1 - lift, y2: link.y2 - lift };
}

export function spousePath(link: SchemeSpouse): string {
  if (link.bracketY !== undefined) return "";
  const dir = Math.sign(link.x2 - link.x1) || 1;
  if (link.curved && link.arcTop) {
    const e = arcEnds(link);
    return `M ${link.x1} ${e.y1} Q ${(link.x1 + link.x2) / 2} ${arcControlY(link)} ${link.x2} ${e.y2}`;
  }
  const x1 = link.x1 + dir * (PORTRAIT_R + 2);
  const x2 = link.x2 - dir * (PORTRAIT_R + 2);
  if (!link.curved) return `M ${x1} ${link.y1} H ${x2}`;
  const mx = (link.x1 + link.x2) / 2;
  return `M ${x1} ${link.y1} Q ${mx} ${arcControlY(link)} ${x2} ${link.y2}`;
}

export function pillPoint(link: SchemeSpouse): { x: number; y: number } {
  if (link.bracketY !== undefined) return { x: (link.x1 + link.x2) / 2, y: link.bracketY };
  if (!link.curved) return { x: (link.x1 + link.x2) / 2, y: link.y1 };
  const cy = arcControlY(link);
  const e = arcEnds(link);
  // Контрольная точка дуги стоит посередине по x, поэтому x растёт с t линейно.
  const t = link.pillT ?? 0.5;
  return { x: link.x1 + t * (link.x2 - link.x1), y: (1 - t) ** 2 * e.y1 + 2 * (1 - t) * t * cy + t * t * e.y2 };
}

/** Размер плашки брака (как рисует экран): ширина по длине слова, высота 24. */
export function pillSize(status: SpouseLink["status"], arrow = false): { w: number; h: number } {
  const len = status === "divorced" ? 6 : status === "widowed" ? 8 : status === "coparents" ? 13 : 4;
  return { w: (len > 12 ? 106 : len > 7 ? 112 : len > 4 ? 88 : 72) + (arrow ? 8 : 0), h: 24 };
}

/** Текст плашки. У плашки на длинной дуге рядом со словом стрелка в сторону второго супруга: плашка у начала дуги не должна читаться как брак с соседней карточкой. */
export function pillLabel(word: string, link: SchemeSpouse): string {
  if (link.pillT === undefined || !link.pillDir) return word;
  return link.pillDir > 0 ? `${word} ›` : `‹ ${word}`;
}

/** Линия от карточки-ссылки к основной карточке человека: дуга над рядом, чтобы не ложиться на соседей. */
export function refLinkPath(l: { x1: number; y1: number; x2: number; y2: number }): string {
  const my = Math.min(l.y1, l.y2) - PORTRAIT_R - 90;
  return `M ${l.x1} ${l.y1 - PORTRAIT_R} C ${l.x1} ${my} ${l.x2} ${my} ${l.x2} ${l.y2 - PORTRAIT_R}`;
}
