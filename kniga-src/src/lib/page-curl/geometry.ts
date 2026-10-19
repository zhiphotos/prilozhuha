/**
 * Перелистывание, которое держится за палец.
 *
 * Две модели, обе без растяжения листа (длина бумаги сохраняется):
 *
 * 1. Загиб угла и вертикальный цилиндр — то, что в InDesign делает PDF.
 *    Сгиб — дуга полуцилиндра. Угол страницы садится в точку пальца.
 * 2. Лист на сшивке — кольца, диски, пружина, гребень.
 *    Край у дырок закреплён, свободный край идёт за пальцем и выгибается дугой.
 */

export type BindingId = "codex" | "wire" | "disc" | "comb" | "rings";

export type Binding = {
  id: BindingId;
  name: string;
  /** Насколько дырка ездит по кольцу, px. У корешка 0. */
  ringR: number;
  /** Жёсткость: 1 обычная бумага, больше — туже гнётся. */
  stiff: number;
};

export const BINDINGS: readonly Binding[] = [
  { id: "codex", name: "Корешок", ringR: 0, stiff: 1 },
  { id: "wire", name: "Пружина", ringR: 2.5, stiff: 1 },
  { id: "disc", name: "Диски", ringR: 3.5, stiff: 1.05 },
  { id: "comb", name: "Гребень", ringR: 3, stiff: 1.2 },
  { id: "rings", name: "Кольца", ringR: 18, stiff: 0.92 },
];

export type Vert = {
  x: number;
  y: number;
  z: number;
  u: number;
  v: number;
  back: boolean;
};

export type Mesh = {
  pos: Float32Array;
  uv: Float32Array;
  shade: Float32Array;
  face: Float32Array;
  index: Uint16Array;
  cols: number;
  rows: number;
};

const PI = Math.PI;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Длина синусной дуги от хорды `chord` с подъёмом `bulge`. */
export function sineLength(chord: number, bulge: number): number {
  const steps = 32;
  let length = 0;
  let px = 0;
  let pz = 0;
  const span = Math.abs(chord);
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const x = s * span;
    const z = bulge * Math.sin(PI * s);
    length += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return length;
}

/** Подъём, при котором дуга имеет нужную длину бумаги. 0 — лист натянут. */
export function bulgeFor(chord: number, length: number): number {
  const span = Math.abs(chord);
  if (!(length > 0) || span >= length) return 0;
  let lo = 0;
  let hi = length;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    if (sineLength(span, mid) < length) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function bowXZ(s: number, chord: number, length: number, stiff = 1): { x: number; z: number } {
  const sign = chord < 0 ? -1 : 1;
  const span = Math.min(Math.abs(chord), length);
  const bulge = bulgeFor(span, length) / Math.max(0.55, stiff);
  return {
    x: sign * span * s,
    z: bulge * Math.sin(PI * s),
  };
}

/**
 * Вертикальный цилиндр: хватают середину обреза и тянут влево.
 * `curlX` — линия, где лист ещё лежит. Правее неё бумага уходит в завиток.
 * Завиток загибается назад, к корешку, и кладётся изнанкой.
 */
export function verticalDeform(
  px: number,
  curlX: number,
  radius: number,
): { x: number; z: number; back: boolean } {
  const dist = px - curlX;
  if (dist <= 0 || radius <= 0.5) return { x: px, z: 0, back: false };
  const phi = dist / radius;
  if (phi < PI) {
    return {
      x: curlX - radius * (1 - Math.cos(phi)),
      z: radius * Math.sin(phi),
      back: phi > PI / 2,
    };
  }
  const extra = dist - PI * radius;
  return { x: curlX - 2 * radius - extra, z: 0, back: true };
}

/** Подбирает линию цилиндра так, чтобы обрез (`px = pageW`) оказался на пальце. */
export function solveCurlX(fingerX: number, pageW: number, radius: number): number {
  let lo = fingerX - pageW;
  let hi = pageW;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    const x = verticalDeform(pageW, mid, radius).x;
    // Меньший curlX сильнее загибает обрез влево.
    if (x > fingerX) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export function curlRadius(pageW: number, travel: number): number {
  const wanted = pageW * 0.1;
  return clamp(Math.min(wanted, Math.max(16, travel / 3.2)), 12, wanted);
}

type Peel = { x: number; y: number; z: number; back: boolean };

/**
 * Загиб угла. Угол C приезжает в палец.
 * Сначала считается резкий сгиб (перпендикуляр через середину),
 * затем полоса у сгиба заменяется полуцилиндром, без щели и без растяжения.
 */
export function deformPeel(
  px: number,
  py: number,
  fingerX: number,
  fingerY: number,
  pageW: number,
  pageH: number,
  radiusMax: number,
): Peel {
  const bottom = fingerY >= pageH * 0.5;
  const cornerX = pageW;
  const cornerY = bottom ? pageH : 0;
  let fx = clamp(fingerX, -pageW * 0.65, pageW);
  let fy = clamp(fingerY, -pageH * 0.35, pageH * 1.35);
  // Не даём тянуть «за страницу»: вектор от угла остаётся в секторе к корешку.
  let vx = fx - cornerX;
  let vy = fy - cornerY;
  const fromLeft = Math.atan2(Math.sin(Math.atan2(vy, vx) - PI), Math.cos(Math.atan2(vy, vx) - PI));
  const maxTurn = 1.05;
  if (Math.abs(fromLeft) > maxTurn) {
    const mag = Math.hypot(vx, vy) || 1;
    const a = PI + Math.sign(fromLeft || 1) * maxTurn;
    vx = Math.cos(a) * mag;
    vy = Math.sin(a) * mag;
    fx = cornerX + vx;
    fy = cornerY + vy;
  }

  const reach = Math.hypot(vx, vy);
  if (reach < 1.5) return { x: px, y: py, z: 0, back: false };

  const radius = curlRadius(pageW, reach);
  const used = Math.min(radius, radiusMax);
  const shift = (PI - 2) * used;
  const inv = 1 / reach;
  const ux = vx * inv;
  const uy = vy * inv;
  // Резкая цель чуть дальше пальца: после укорочения цилиндром угол сядет в палец.
  const sx = fx + ux * shift;
  const sy = fy + uy * shift;
  const mx = (cornerX + sx) / 2;
  const my = (cornerY + sy) / 2;
  const sl = Math.hypot(sx - cornerX, sy - cornerY) || 1;
  const uxx = (sx - cornerX) / sl;
  const uyy = (sy - cornerY) / sl;
  const tx = -uyy;
  const ty = uxx;
  const side = (px - mx) * uxx + (py - my) * uyy;
  if (side >= -0.01) return { x: px, y: py, z: 0, back: false };

  const dist = -side;
  const band = PI * used;
  const along = (px - mx) * tx + (py - my) * ty;
  if (dist <= band) {
    const phi = dist / used;
    const h = used * (1 - Math.cos(phi));
    return {
      x: mx + tx * along + uxx * h,
      y: my + ty * along + uyy * h,
      z: used * Math.sin(phi),
      back: phi > PI / 2,
    };
  }
  return {
    x: px - 2 * side * uxx - uxx * shift,
    y: py - 2 * side * uyy - uyy * shift,
    z: 0,
    back: true,
  };
}

function shadeFromSlope(dx: number, dz: number, back: boolean): number {
  const slope = Math.abs(dz) / (Math.hypot(dx, dz) || 1);
  const crest = 1 - 0.34 * slope;
  return (back ? 0.8 : 1) * crest;
}

export function gridMesh(cols: number, rows: number, at: (c: number, r: number) => Vert): Mesh {
  const nx = cols + 1;
  const ny = rows + 1;
  const pos = new Float32Array(nx * ny * 3);
  const uv = new Float32Array(nx * ny * 2);
  const shade = new Float32Array(nx * ny);
  const face = new Float32Array(nx * ny);
  const verts: Vert[] = new Array(nx * ny);
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const v = at(c, r);
      verts[r * nx + c] = v;
      const i = r * nx + c;
      pos[i * 3] = v.x;
      pos[i * 3 + 1] = v.y;
      pos[i * 3 + 2] = v.z;
      uv[i * 2] = v.u;
      uv[i * 2 + 1] = v.v;
      face[i] = v.back ? 1 : 0;
    }
  }
  for (let r = 0; r < ny; r++) {
    for (let c = 0; c < nx; c++) {
      const i = r * nx + c;
      const n = c < cols ? verts[i + 1] : verts[i - 1];
      const v = verts[i];
      const dir = c < cols ? 1 : -1;
      shade[i] = shadeFromSlope((n.x - v.x) * dir, (n.z - v.z) * dir, v.back);
      face[i] = v.back ? 1 : 0;
    }
  }
  const index = new Uint16Array(cols * rows * 6);
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * nx + c;
      index[k++] = i;
      index[k++] = i + 1;
      index[k++] = i + nx;
      index[k++] = i + 1;
      index[k++] = i + nx + 1;
      index[k++] = i + nx;
    }
  }
  return { pos, uv, shade, face, index, cols, rows };
}

export function buildPeelMesh(opts: {
  pageX: number;
  pageY: number;
  width: number;
  height: number;
  fingerX: number;
  fingerY: number;
  mode: "corner" | "edge";
  cols?: number;
  rows?: number;
}): Mesh {
  const cols = opts.cols ?? 46;
  const rows = opts.rows ?? 18;
  const { pageX, pageY, width, height } = opts;
  const localX = opts.fingerX - pageX;
  const localY = opts.fingerY - pageY;
  if (opts.mode === "edge") {
    const radius = curlRadius(width, Math.max(0, width - localX));
    const curlX = solveCurlX(Math.min(localX, width - 0.5), width, radius);
    return gridMesh(cols, rows, (c, r) => {
      const s = c / cols;
      const t = r / rows;
      const d = verticalDeform(s * width, curlX, radius);
      return {
        x: pageX + d.x,
        y: pageY + t * height,
        z: d.z,
        u: s,
        v: t,
        back: d.back,
      };
    });
  }
  return gridMesh(cols, rows, (c, r) => {
    const s = c / cols;
    const t = r / rows;
    const d = deformPeel(s * width, t * height, localX, localY, width, height, width * 0.07);
    return {
      x: pageX + d.x,
      y: pageY + d.y,
      z: d.z,
      u: s,
      v: t,
      back: d.back,
    };
  });
}

/**
 * Лист на пружине, дисках, гребне или кольцах.
 * Край у сшивки закреплён. Весь лист поворачивается одной плоскостью
 * и не рвётся: длина бумаги и высота ряда сохраняются.
 */
export function buildBowMesh(opts: {
  hingeX: number;
  top: number;
  width: number;
  height: number;
  fingerX: number;
  fingerY: number;
  grabT: number;
  /** Доля ширины листа, за которую взялись. 1 — сам обрез. */
  grabS?: number;
  ringR: number;
  stiff: number;
  /** 1 — обрез справа, -1 — листаем левую страницу (обрез слева). */
  dir: 1 | -1;
  cols?: number;
  rows?: number;
}): Mesh {
  const cols = opts.cols ?? 28;
  const rows = opts.rows ?? 10;
  const { hingeX, top, width, height, stiff, dir } = opts;
  const grabT = clamp(opts.grabT, 0.08, 0.92);
  const grabS = clamp(opts.grabS ?? 1, 0.45, 1);
  const radius = Math.max(24, grabS * width);
  const fingerLocal = dir * (opts.fingerX - hingeX);
  // Дальше обреза лист не тянется. Ближе к сшивке — поднимается и переходит на другую сторону.
  const chord = clamp(fingerLocal, -radius, radius);
  const cosA = chord / radius;
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA)) / Math.max(0.85, stiff);
  const back = cosA < -0.04;
  const yPull = clamp(opts.fingerY - (top + grabT * height), -height * 0.18, height * 0.18);

  return gridMesh(cols, rows, (c, r) => {
    const s = c / cols;
    const t = r / rows;
    const along = s * width;
    const localX = cosA * along;
    const z = sinA * along;
    const yFollow = yPull * Math.min(1, s / grabS) * 0.35;
    return {
      x: hingeX + dir * localX,
      y: top + t * height + yFollow,
      z,
      u: dir === 1 ? s : 1 - s,
      v: t,
      back,
    };
  });
}
