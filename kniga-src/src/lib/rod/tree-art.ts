// Рисованное дерево для страницы «Книга»: строится кодом, растёт плавно вместе с прогрессом и бывает нескольких видов.
// Все числа детерминированы (без случайности «на лету»): уже выросшие ветки при росте не меняются, только добавляются новые.

export type TreeKind = "gold" | "oak" | "sakura" | "birch" | "autumn";

export const TREE_KINDS: { id: TreeKind; name: string }[] = [
  { id: "gold", name: "Золотое" },
  { id: "oak", name: "Дуб" },
  { id: "sakura", name: "Сакура" },
  { id: "birch", name: "Берёза" },
  { id: "autumn", name: "Осень" },
];

export const TREE_VIEW = { w: 100, h: 260 } as const;

export type Look = { trunk: string; bark?: string; leaves: string[]; leaf: "round" | "petal" | "drop"; spread: number; shrink: number; limbs: number; sway: number; ground: string; glow?: string };

const LOOKS: Record<TreeKind, Look> = {
  gold: { trunk: "#3f4a2a", leaves: ["#c9a24a", "#e2c071", "#a8842f", "#d8b45c"], leaf: "drop", spread: 0.5, shrink: 0.74, limbs: 2, sway: 0.18, ground: "#8a7a45", glow: "#f3e2a9" },
  oak: { trunk: "#5b4636", leaves: ["#4f7a3a", "#6b9a4a", "#3e6530", "#7fae58"], leaf: "round", spread: 0.55, shrink: 0.75, limbs: 2, sway: 0.22, ground: "#6a5a3c" },
  sakura: { trunk: "#4a3a3a", leaves: ["#f4b6c6", "#f9d2dc", "#e993ab", "#fde8ee"], leaf: "petal", spread: 0.62, shrink: 0.72, limbs: 2, sway: 0.3, ground: "#8a6a6a" },
  birch: { trunk: "#e9e4d8", bark: "#3b3a36", leaves: ["#9bc26a", "#b4d682", "#86ad56", "#c9e39b"], leaf: "drop", spread: 0.38, shrink: 0.78, limbs: 3, sway: 0.16, ground: "#7c8a5a" },
  autumn: { trunk: "#5a3f2e", leaves: ["#d9822b", "#c1502e", "#e8b04a", "#a63d2f"], leaf: "round", spread: 0.55, shrink: 0.75, limbs: 2, sway: 0.24, ground: "#7a5a3a" },
};

export type Seg = { d: string; w: number; mark?: { x: number; y: number } };
export type Leaf = { x: number; y: number; r: number; rot: number; fill: string; shape: Look["leaf"]; o: number };
export type TreeShape = { segs: Seg[]; leaves: Leaf[]; look: Look; height: number };

/** Детерминированное число 0..1 из строки (путь ветки) и соли. */
export function hash01(key: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/**
 * Дерево нужного вида при росте `t` (0 — семечко, 1 — полная крона).
 * Уровень L = 0..7 плавно растёт с t: ветка глубины d видна на долю clamp(L − d), поэтому рост непрерывный, а уровни (ствол, первые ветви, крона, цветение) видны отчётливо.
 */
export function buildTree(kind: TreeKind, t: number): TreeShape {
  const look = LOOKS[kind];
  const g = clamp01(t);
  // Рост быстрее вначале и спокойнее к концу: уже на средних уровнях у дерева несколько ветвей и первая листва.
  const L = 8.2 * (1 - Math.pow(1 - g, 1.6));
  const segs: Seg[] = [];
  const leaves: Leaf[] = [];
  const baseY = TREE_VIEW.h - 12;
  const cx = TREE_VIEW.w / 2;
  let top = baseY;

  const grow = (x: number, y: number, ang: number, len: number, wid: number, depth: number, key: string) => {
    const f = smooth(L - depth);
    if (f <= 0.001) return;
    const bend = (hash01(key, 1) - 0.5) * look.sway * 2;
    const a2 = ang + bend * 0.5;
    // Ветка не выходит за боковые края листа: если упирается, становится короче.
    let l = len * f;
    const sx = Math.sin(a2) * l;
    if (x + sx < 6) l *= Math.max(0.15, (x - 6) / Math.max(0.01, -sx));
    else if (x + sx > TREE_VIEW.w - 6) l *= Math.max(0.15, (TREE_VIEW.w - 6 - x) / Math.max(0.01, sx));
    const ex = Math.min(TREE_VIEW.w - 4, Math.max(4, x + Math.sin(a2) * l));
    const ey = Math.max(8, y - Math.cos(a2) * l);
    const mx = x + Math.sin(ang - bend) * l * 0.5;
    const my = y - Math.cos(ang - bend) * l * 0.5;
    const w = Math.max(0.6, wid * (0.55 + 0.45 * f));
    const seg: Seg = { d: `M${x.toFixed(2)} ${y.toFixed(2)} Q${mx.toFixed(2)} ${my.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`, w };
    if (look.bark && depth === 0 && f > 0.4) seg.mark = { x: (x + ex) / 2, y: (y + ey) / 2 };
    segs.push(seg);
    top = Math.min(top, ey);
    if (depth >= 2 || (depth === 1 && L > 3.2)) {
      const n = depth >= 3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const k = `${key}.l${i}`;
        const along = 0.55 + 0.45 * hash01(k, 7);
        const px = x + (ex - x) * along;
        const py = y + (ey - y) * along;
        const bloom = smooth(L - 3 - depth * 0.35 - hash01(k, 3) * 0.8);
        if (bloom > 0.02) {
          const fill = look.leaves[Math.floor(hash01(k, 5) * look.leaves.length) % look.leaves.length]!;
          leaves.push({ x: Math.min(TREE_VIEW.w - 3, Math.max(3, px + (hash01(k, 8) - 0.5) * 5)), y: py + (hash01(k, 9) - 0.5) * 5, r: (2.2 + hash01(k, 4) * 2.4) * bloom, rot: hash01(k, 6) * 360, fill, shape: look.leaf, o: 0.55 + 0.4 * bloom });
        }
      }
    }
    // Лист на кончике: остаётся и после того, как ветка выросла полностью.
    if (depth >= 2 && f > 0.3) {
      const bloom = smooth(L - 3.4 - depth * 0.3);
      if (bloom > 0.02) leaves.push({ x: Math.min(TREE_VIEW.w - 3, Math.max(3, ex)), y: ey, r: (3 + hash01(key, 2) * 2.4) * bloom, rot: hash01(key, 6) * 360, fill: look.leaves[Math.floor(hash01(key, 5) * look.leaves.length) % look.leaves.length]!, shape: look.leaf, o: 0.9 });
    }
    if (depth >= 6) return;
    if (f < 0.55) return;
    const kids = depth === 0 ? Math.max(2, look.limbs) : look.limbs;
    for (let i = 0; i < kids; i++) {
      const side = kids === 1 ? 0 : (i / (kids - 1)) * 2 - 1;
      const kk = `${key}.${i}`;
      const jitter = (hash01(kk, 11) - 0.5) * 0.28;
      const childAng = ang + side * look.spread + jitter * (depth === 0 ? 0.4 : 1);
      const shrink = look.shrink * (0.9 + 0.2 * hash01(kk, 12));
      const spawnAt = depth === 0 ? 0.62 + 0.3 * hash01(kk, 13) : 1;
      const sx = x + (ex - x) * spawnAt;
      const sy = y + (ey - y) * spawnAt;
      grow(sx, sy, childAng, len * shrink * (depth === 0 ? 1.15 : 1), wid * 0.66, depth + 1, kk);
    }
  };

  // Ствол: ниже по высоте, чем крона; полная крона занимает весь лист по высоте.
  grow(cx, baseY, 0, TREE_VIEW.h * 0.3, 4.4, 0, kind);
  return { segs, leaves, look, height: baseY - top };
}
