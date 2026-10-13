import type { CSSProperties } from "react";

/** Векторные ботанические мотивы: один стиль, рисуются кодом, не весят ничего. */
export type Pal = { line: string; deep: string; mid: string; light: string; accent: string };
export const PAL_LIGHT: Pal = { line: "#2b3a22", deep: "#3f4a22", mid: "#8f9a74", light: "#e7e1d3", accent: "#6e2a44" };
export const PAL_DARK: Pal = { line: "#ece5d3", deep: "#3f4a22", mid: "#737b5c", light: "#ece5d3", accent: "#c9ae74" };

const SW = 1.25;
const r2 = (n: number) => Math.round(n * 100) / 100;
const rng = (s: number) => () => (s = (s * 16807) % 2147483647) / 2147483647;
const st = (p: Pal, w = SW) => `stroke="${p.line}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function leaf(p: Pal, x: number, y: number, a: number, len: number, w: number, fill?: string, vein = true, belly = 0.5): string {
  const d =
    `M0 0C${r2(w)} ${r2(-len * belly * 0.5)} ${r2(w * 0.7)} ${r2(-len * 0.82)} 0 ${r2(-len)}` +
    `C${r2(-w * 0.7)} ${r2(-len * 0.82)} ${r2(-w)} ${r2(-len * belly * 0.5)} 0 0Z`;
  const v = vein ? `<path d="M0 -1V${r2(-len * 0.8)}" fill="none" ${st(p, SW * 0.7)}/>` : "";
  return `<g transform="translate(${r2(x)} ${r2(y)}) rotate(${r2(a)})"><path d="${d}" fill="${fill ?? p.mid}" ${st(p)}/>${v}</g>`;
}

const petal = (p: Pal, x: number, y: number, a: number, len: number, w: number, fill?: string) => leaf(p, x, y, a, len, w, fill ?? p.light, false, 1.15);

function berry(p: Pal, x: number, y: number, r: number, fill?: string): string {
  return (
    `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r}" fill="${fill ?? p.accent}" ${st(p)}/>` +
    `<path d="M${r2(x - r * 0.45)} ${r2(y - r * 0.2)}A${r * 0.5} ${r * 0.5} 0 0 1 ${r2(x - r * 0.1)} ${r2(y - r * 0.55)}" fill="none" stroke="${p.light}" stroke-width="1" stroke-linecap="round"/>`
  );
}

type Stem = { d: string; at: (t: number) => { x: number; y: number; a: number } };

function stem(x0: number, y0: number, x1: number, y1: number, bend = 0): Stem {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const cx = (x0 + x1) / 2 - (dy / L) * bend;
  const cy = (y0 + y1) / 2 + (dx / L) * bend;
  return {
    d: `M${x0} ${y0}Q${r2(cx)} ${r2(cy)} ${x1} ${y1}`,
    at: (t) => {
      const u = 1 - t;
      return {
        x: u * u * x0 + 2 * u * t * cx + t * t * x1,
        y: u * u * y0 + 2 * u * t * cy + t * t * y1,
        a: (Math.atan2(2 * u * (cx - x0) + 2 * t * (x1 - cx), -(2 * u * (cy - y0) + 2 * t * (y1 - cy))) * 180) / Math.PI,
      };
    },
  };
}

const stemSvg = (p: Pal, s: Stem, w = SW * 1.4) => `<path d="${s.d}" fill="none" ${st(p, w)}/>`;

type BranchOpt = { n: number; from?: number; to?: number; spread: number; len: (t: number) => number; w: (t: number) => number; alt?: boolean; tip?: boolean; fills?: string[]; belly?: number; vein?: boolean };

function branch(p: Pal, s: Stem, o: BranchOpt): string {
  let out = stemSvg(p, s);
  const { n, from = 0, to = 1 } = o;
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? from : from + ((to - from) * i) / (n - 1);
    const { x, y, a } = s.at(t);
    const fill = o.fills ? o.fills[i % o.fills.length] : i % 2 ? p.deep : p.mid;
    const sides = o.alt ? [i % 2 ? 1 : -1] : [-1, 1];
    for (const side of sides) out += leaf(p, x, y, a + side * o.spread * (1 - 0.25 * t), o.len(t), o.w(t), fill, o.vein ?? true, o.belly ?? 0.5);
  }
  if (o.tip) {
    const e = s.at(1);
    out += leaf(p, e.x, e.y, e.a, o.len(1) + 3, o.w(1) + 1, o.fills?.[0] ?? p.mid, o.vein ?? true);
  }
  return out;
}

function rosette(p: Pal, cx: number, cy: number, n: number, len: number, w: number, fill?: string, core?: string, rot = 0): string {
  let o = "";
  for (let i = 0; i < n; i += 1) o += petal(p, cx, cy, rot + (360 / n) * i, len, w, fill);
  return o + `<circle cx="${cx}" cy="${cy}" r="${r2(len * 0.2)}" fill="${core ?? p.accent}" ${st(p)}/>`;
}

type MotifDef = { draw: (p: Pal) => string; cats: string[] };

const MOTIFS: Record<string, MotifDef> = {
  fern: { cats: ["kin", "road"], draw: (p) => branch(p, stem(50, 135, 58, 12, 12), { n: 15, from: 0.08, to: 0.98, spread: 64, tip: true, len: (t) => 30 * (1 - t) + 5, w: (t) => 5 * (1 - t) + 1.8 }) },
  rowan: {
    cats: ["grandma", "dinner", "feast"],
    draw: (p) => {
      const s = stem(50, 135, 46, 42, -10);
      const e = s.at(1);
      const R = rng(11);
      let o = branch(p, s, { n: 4, from: 0.15, to: 0.7, spread: 50, len: () => 20, w: () => 8, alt: true });
      for (let i = 0; i < 7; i += 1) {
        const a = (-70 + i * 23) * (Math.PI / 180);
        const d = 18 + R() * 8;
        const bx = e.x + Math.sin(a) * d;
        const by = e.y - Math.cos(a) * d * 0.8 - 4;
        o += `<path d="M${r2(e.x)} ${r2(e.y)}L${r2(bx)} ${r2(by)}" fill="none" ${st(p)}/>` + berry(p, bx, by, 5.5);
      }
      return o;
    },
  },
  wheat: {
    cats: ["dinner", "feast", "dad"],
    draw: (p) =>
      stemSvg(p, stem(50, 135, 50, 70, 2)) +
      leaf(p, 50, 118, -28, 55, 6, p.mid) +
      leaf(p, 50, 112, 30, 48, 5.5, p.deep) +
      branch(p, stem(50, 72, 52, 8, 3), { n: 8, from: 0.05, to: 0.85, spread: 24, tip: true, len: () => 15, w: () => 5.5, fills: [p.light, p.accent], belly: 0.7, vein: false }),
  },
  chamomile: { cats: ["mom", "feast"], draw: (p) => stemSvg(p, stem(50, 135, 50, 48, 4)) + leaf(p, 50, 112, -50, 30, 7) + leaf(p, 50, 96, 55, 26, 6, p.deep) + rosette(p, 50, 38, 13, 20, 5, p.light, p.accent) },
  clover: { cats: ["dinner", "grandma"], draw: (p) => stemSvg(p, stem(50, 135, 50, 62, 6)) + [0, 120, 240].map((a) => leaf(p, 50, 60, a, 20, 14, a ? p.mid : p.deep, true, 1.2)).join("") },
  lavender: {
    cats: ["mom", "grandma"],
    draw: (p) =>
      leaf(p, 50, 130, -22, 50, 2.6, p.mid, false) +
      leaf(p, 50, 130, 18, 44, 2.6, p.deep, false) +
      branch(p, stem(50, 135, 52, 14, 4), { n: 10, from: 0.38, to: 0.98, spread: 28, tip: true, len: (t) => 11 - 4 * t, w: () => 3.4, fills: [p.accent, p.mid], vein: false, belly: 0.8 }),
  },
  oak: { cats: ["kin", "dad", "grandpa"], draw: (p) => branch(p, stem(50, 135, 50, 20, 6), { n: 6, from: 0.3, to: 0.92, spread: 68, tip: true, len: (t) => 8 + 24 * Math.sin(Math.PI * t), w: () => 9, belly: 1, fills: [p.mid, p.deep] }) },
  seeds: {
    cats: ["album", "road", "kin"],
    draw: (p) => {
      const R = rng(5);
      let o = "";
      for (let i = 0; i < 7; i += 1) o += leaf(p, 14 + R() * 72, 40 + R() * 90, R() * 360, 10, 4, i % 3 ? p.light : p.accent, false, 1.1);
      return o;
    },
  },
  rose: {
    cats: ["grandma", "feast"],
    draw: (p) => stemSvg(p, stem(50, 135, 48, 60, -5)) + leaf(p, 48, 105, -55, 24, 8) + leaf(p, 48, 90, 58, 22, 7, p.deep) + rosette(p, 48, 40, 5, 26, 14, p.accent, p.light, 0),
  },
  grass: { cats: ["road", "grandpa"], draw: (p) => [-22, -10, 0, 9, 20].map((a, i) => leaf(p, 50 + a * 0.5, 135, a, 118 - Math.abs(a) * 1.2, 4.2, i % 2 ? p.deep : p.mid, true, 0.3)).join("") },
  sprout: {
    cats: ["kin", "album"],
    draw: (p) => stemSvg(p, stem(50, 135, 50, 78, 3)) + leaf(p, 50, 98, -62, 30, 17, p.mid, true, 1) + leaf(p, 50, 98, 62, 30, 17, p.deep, true, 1) + leaf(p, 50, 78, -20, 22, 8) + leaf(p, 50, 78, 22, 22, 8, p.deep),
  },
  spruce: { cats: ["grandpa", "dad", "road"], draw: (p) => branch(p, stem(50, 135, 50, 10, 0), { n: 14, from: 0.1, to: 0.98, spread: 68, tip: true, len: (t) => 36 * (1 - t) + 8, w: () => 3, vein: false, fills: [p.deep, p.mid] }) },
  moss: {
    cats: ["album", "kin"],
    draw: (p) => {
      const R = rng(7);
      let o = "";
      for (let r = -3; r <= 3; r += 1) {
        const c = 4 - Math.abs(r);
        for (let k = 0; k < c; k += 1) {
          const x = 50 + (k - (c - 1) / 2) * 18;
          const y = 70 + r * 16;
          const s = 7 + R() * 4;
          o += `<path d="M${r2(x)} ${r2(y - s)}L${r2(x + s)} ${r2(y)}L${r2(x)} ${r2(y + s)}L${r2(x - s)} ${r2(y)}Z" fill="${R() > 0.5 ? p.mid : p.deep}" ${st(p)}/>`;
        }
      }
      return o;
    },
  },
  flax: { cats: ["mom", "album"], draw: (p) => branch(p, stem(50, 135, 54, 44, 5), { n: 12, from: 0.1, to: 0.8, spread: 32, len: () => 14, w: () => 1.8, alt: true, vein: false, belly: 0.6 }) + rosette(p, 54, 36, 5, 17, 9, p.light, p.accent, 18) },
  laurel: { cats: ["kin"], draw: (p) => branch(p, stem(14, 120, 86, 120, -90), { n: 9, from: 0.05, to: 0.95, spread: 48, alt: true, tip: true, len: () => 17, w: () => 6.5 }) },
};

export function Botanica({ id, pal = PAL_LIGHT, opacity = 1, className, style }: { id: string; pal?: Pal; opacity?: number; className?: string; style?: CSSProperties }) {
  const motif = MOTIFS[id];
  if (!motif) return null;
  return <svg viewBox="0 0 100 140" className={className} style={style} opacity={opacity} aria-hidden="true" dangerouslySetInnerHTML={{ __html: motif.draw(pal) }} />;
}

/** Мотив по колоде и номеру карточки: подряд один и тот же не повторяется. */
export function motifFor(deck: string, index: number): string {
  const list = Object.entries(MOTIFS)
    .filter(([, value]) => value.cats.includes(deck))
    .map(([key]) => key);
  return list[index % (list.length || 1)] ?? "sprout";
}

type Put = [id: string, x: number, y: number, rot: number, scale: number, op?: number];
const HEROES: Record<string, Put[]> = {
  home: [["fern", 40, 700, -8, 4.4], ["wheat", 330, 690, 6, 3.6], ["chamomile", 215, 700, 0, 1.6]],
  onboarding: [["oak", 80, 650, -20, 2.4], ["sprout", 270, 660, 14, 2.2], ["laurel", 180, 290, 0, 3.4]],
  empty: [["sprout", 180, 440, 0, 2.4], ["seeds", 180, 420, 0, 3.6, 0.9]],
  error: [["grass", 120, 680, 28, 3.8, 0.8], ["fern", 300, 690, 70, 3.2, 0.6], ["seeds", 180, 560, 0, 3.4, 0.7]],
  archive: [["moss", 180, 400, 0, 5, 0.35], ["lavender", 50, 700, -6, 3.4, 0.5], ["lavender", 310, 700, 6, 3.4, 0.5]],
};

export function Hero({ name, pal = PAL_DARK, className }: { name: string; pal?: Pal; className?: string }) {
  const html = (HEROES[name] ?? [])
    .map(([id, x, y, rot, scale, op = 1]) => `<g opacity="${op}" transform="translate(${x} ${y}) rotate(${rot}) scale(${scale}) translate(-50 -135)">${MOTIFS[id].draw(pal)}</g>`)
    .join("");
  return <svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Вырезка из её фото-библиотеки (public/stickers/pack). Ленивая загрузка, размеры заданы. */
export function Cut({ id, className, style, alt = "" }: { id: string; className?: string; style?: CSSProperties; alt?: string }) {
  return <img src={`stickers/pack/${id}.webp`} alt={alt} draggable={false} className={className} style={style} />;
}

export function packUrl(id: string): string {
  return `stickers/pack/${id}.webp`;
}

/** Фон из библиотеки для CSS-переменной: адрес считается от страницы, а не от файла стилей. */
export function packBg(id: string): string {
  const base = typeof document !== "undefined" ? document.baseURI : "";
  return `url("${new URL(packUrl(id), base || "http://localhost/").href}")`;
}

/** Нарисованная от руки стрелка-загогулина: подпись показывает на главное. */
export function HandArrow({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8C14 4 26 8 30 18C34 28 28 34 22 30C17 26 24 19 33 22C42 25 49 30 58 33" />
      <path d="M50 27L58 33L48 37" />
    </svg>
  );
}

/** Волнистое подчёркивание под словом, как карандашом. */
export function HandUnderline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 10" preserveAspectRatio="none" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
      <path d="M2 6C14 2 22 9 36 5C50 1 58 9 72 5C86 1 96 8 118 4" />
    </svg>
  );
}
