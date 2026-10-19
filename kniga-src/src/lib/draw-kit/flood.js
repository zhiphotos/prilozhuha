/**
 * Заливка области на прозрачном слое контура.
 * Стена — пиксель с alpha >= alphaWall. Красим только пустоту внутри.
 * Если область доходит до края холста, контур не замкнут: ничего не пишем.
 */

/**
 * @param {Uint8Array} walls
 * @param {number} width
 * @param {number} height
 * @param {number} radius
 */
export function dilateWalls(walls, width, height, radius) {
  if (radius <= 0) return walls;
  const out = new Uint8Array(width * height);
  const r2 = radius * radius;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!walls[y * width + x]) continue;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let ny = y0; ny <= y1; ny++) {
        const row = ny * width;
        for (let nx = x0; nx <= x1; nx++) {
          const dx = nx - x;
          const dy = ny - y;
          if (dx * dx + dy * dy <= r2) out[row + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * @param {Uint8ClampedArray} src RGBA
 * @param {number} width
 * @param {number} height
 * @param {number} sx
 * @param {number} sy
 * @param {{ alphaWall?: number, gap?: number, edgeIsWall?: boolean }} [opts]
 * @returns {{ ok: true, pixels: number[] } | { ok: false, reason: 'outside' | 'wall' | 'open', pixels?: number }}
 */
export function floodRegion(src, width, height, sx, sy, opts = {}) {
  const alphaWall = opts.alphaWall ?? 48;
  const gap = opts.gap ?? 1;
  const edgeIsWall = opts.edgeIsWall ?? false;
  const x0 = Math.round(sx);
  const y0 = Math.round(sy);
  if (x0 < 0 || y0 < 0 || x0 >= width || y0 >= height) {
    return { ok: false, reason: "outside" };
  }

  const n = width * height;
  let walls = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (src[i * 4 + 3] >= alphaWall) walls[i] = 1;
  }
  if (gap > 0) walls = dilateWalls(walls, width, height, gap);
  if (edgeIsWall) {
    for (let x = 0; x < width; x++) {
      walls[x] = 1;
      walls[(height - 1) * width + x] = 1;
    }
    for (let y = 0; y < height; y++) {
      walls[y * width] = 1;
      walls[y * width + (width - 1)] = 1;
    }
  }

  const seed = y0 * width + x0;
  if (walls[seed]) return { ok: false, reason: "wall" };

  const seen = new Uint8Array(n);
  const qx = [x0];
  const qy = [y0];
  seen[seed] = 1;
  const pixels = [];
  let open = false;
  let head = 0;

  while (head < qx.length) {
    const x = qx[head];
    const y = qy[head];
    head++;
    pixels.push(y * width + x);
    if (!edgeIsWall && (x === 0 || y === 0 || x === width - 1 || y === height - 1)) {
      open = true;
    }
    if (x > 0) visit(x - 1, y);
    if (x + 1 < width) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y + 1 < height) visit(x, y + 1);
  }

  if (open) return { ok: false, reason: "open", pixels: pixels.length };
  return { ok: true, pixels };

  function visit(x, y) {
    const i = y * width + x;
    if (seen[i] || walls[i]) return;
    seen[i] = 1;
    qx.push(x);
    qy.push(y);
  }
}

/**
 * Записывает цвет в перечисленные пиксели, не трогая остальные.
 * @param {Uint8ClampedArray} dest
 * @param {number[]} pixels
 * @param {[number, number, number, number]} rgba
 */
export function paintPixels(dest, pixels, rgba) {
  for (let k = 0; k < pixels.length; k++) {
    const o = pixels[k] * 4;
    dest[o] = rgba[0];
    dest[o + 1] = rgba[1];
    dest[o + 2] = rgba[2];
    dest[o + 3] = rgba[3];
  }
}
