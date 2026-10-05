/** Lift a photo off a plain background so it can sit on the page like a sticker. */

export function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr * 2 + dg * dg * 4 + db * db * 3);
}

function borderClusters(data: Uint8ClampedArray, width: number, height: number): Array<[number, number, number]> {
  const samples: Array<[number, number, number]> = [];
  const push = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    if (data[offset + 3] < 200) return;
    if ((x + y) % 2) return;
    samples.push([data[offset], data[offset + 1], data[offset + 2]]);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  if (samples.length < 12) return [];
  let centers: Array<[number, number, number]> = [samples[0], samples[samples.length >> 1], samples[samples.length - 1]];
  for (let iter = 0; iter < 6; iter++) {
    const sums = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    samples.forEach((sample) => {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((center, index) => {
        const distance = colorDist(sample[0], sample[1], sample[2], center[0], center[1], center[2]);
        if (distance < bestD) {
          bestD = distance;
          best = index;
        }
      });
      sums[best][0] += sample[0];
      sums[best][1] += sample[1];
      sums[best][2] += sample[2];
      sums[best][3] += 1;
    });
    centers = sums.map((sum, index) =>
      sum[3] ? [sum[0] / sum[3], sum[1] / sum[3], sum[2] / sum[3]] : centers[index],
    );
  }
  return centers.filter((_, index) => sumsCount(samples, centers, index) > samples.length * 0.04);
}

function sumsCount(samples: Array<[number, number, number]>, centers: Array<[number, number, number]>, target: number): number {
  let count = 0;
  samples.forEach((sample) => {
    let best = 0;
    let bestD = Infinity;
    centers.forEach((center, index) => {
      const distance = colorDist(sample[0], sample[1], sample[2], center[0], center[1], center[2]);
      if (distance < bestD) {
        bestD = distance;
        best = index;
      }
    });
    if (best === target) count += 1;
  });
  return count;
}

function nearest(r: number, g: number, b: number, clusters: Array<[number, number, number]>): number {
  let best = Infinity;
  clusters.forEach((center) => {
    const distance = colorDist(r, g, b, center[0], center[1], center[2]);
    if (distance < best) best = distance;
  });
  return best;
}

function oneSubject(removed: Uint8Array, width: number, height: number): boolean {
  const total = width * height;
  const seen = new Uint8Array(total);
  let largest = 0;
  let kept = 0;
  let blobs = 0;
  for (let index = 0; index < total; index++) {
    if (removed[index] || seen[index]) continue;
    let size = 0;
    const stack = [index];
    seen[index] = 1;
    while (stack.length) {
      const current = stack.pop() as number;
      size += 1;
      const x = current % width;
      const y = (current - x) / width;
      const step = (next: number) => {
        if (removed[next] || seen[next]) return;
        seen[next] = 1;
        stack.push(next);
      };
      if (x > 0) step(current - 1);
      if (x < width - 1) step(current + 1);
      if (y > 0) step(current - width);
      if (y < height - 1) step(current + width);
    }
    kept += size;
    if (size > largest) largest = size;
    if (size > 6) blobs += 1;
  }
  if (!kept) return false;
  return blobs <= 1 && largest / kept >= 0.99;
}

function neighbors(index: number, width: number, height: number): number[] {
  const x = index % width;
  const y = (index - x) / width;
  const list: number[] = [];
  if (x > 0) list.push(index - 1);
  if (x < width - 1) list.push(index + 1);
  if (y > 0) list.push(index - width);
  if (y < height - 1) list.push(index + width);
  return list;
}

/** Returns true and writes transparency when a plain backdrop can be lifted. */
export function cutBackground(data: Uint8ClampedArray, width: number, height: number): boolean {
  if (width < 8 || height < 8) return false;
  const clusters = borderClusters(data, width, height);
  if (!clusters.length) return false;
  const total = width * height;
  const removed = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  let count = 0;

  const removable = (index: number) => {
    const offset = index * 4;
    if (data[offset + 3] < 16) return true;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const distance = nearest(r, g, b, clusters);
    if (distance <= 44) return true;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    return distance <= 72 && lum > 210;
  };

  const seed = (index: number) => {
    if (removed[index] || !removable(index)) return;
    removed[index] = 1;
    queue[tail++] = index;
    count += 1;
  };

  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head++];
    neighbors(index, width, height).forEach((next) => {
      if (removed[next] || !removable(next)) return;
      removed[next] = 1;
      queue[tail++] = next;
      count += 1;
    });
  }

  const ratio = count / total;
  if (ratio < 0.08 || ratio > 0.84) return false;
  if (!oneSubject(removed, width, height) || !calmBackdrop(data, removed)) return false;

  for (let index = 0; index < total; index++) {
    const around = neighbors(index, width, height);
    const touchesRemoved = around.some((next) => removed[next] === 1);
    const offset = index * 4;
    if (removed[index]) {
      data[offset + 3] = 0;
    } else if (touchesRemoved) {
      data[offset + 3] = Math.min(data[offset + 3], 230);
    }
  }
  return true;
}

function calmBackdrop(data: Uint8ClampedArray, removed: Uint8Array): boolean {
  let count = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (let index = 0; index < removed.length; index += 7) {
    if (!removed[index]) continue;
    const offset = index * 4;
    red += data[offset];
    green += data[offset + 1];
    blue += data[offset + 2];
    count += 1;
  }
  if (count < 12) return false;
  const meanR = red / count;
  const meanG = green / count;
  const meanB = blue / count;
  let variance = 0;
  let seen = 0;
  for (let index = 0; index < removed.length; index += 7) {
    if (!removed[index]) continue;
    const offset = index * 4;
    const dr = data[offset] - meanR;
    const dg = data[offset + 1] - meanG;
    const db = data[offset + 2] - meanB;
    variance += dr * dr + dg * dg + db * db;
    seen += 1;
  }
  return variance / seen < 220;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Снимок не открылся"));
    image.src = src;
  });
}

function trimCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const context = source.getContext("2d", { willReadFrequently: true });
  if (!context) return source;
  const { width, height } = source;
  const data = context.getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX <= minX || maxY <= minY) return source;
  const pad = 8;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const nextW = maxX - minX + 1;
  const nextH = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = nextW;
  out.height = nextH;
  out.getContext("2d")?.drawImage(source, minX, minY, nextW, nextH, 0, 0, nextW, nextH);
  return out;
}

function toPng(canvas: HTMLCanvasElement): string {
  let current = canvas;
  let url = current.toDataURL("image/png");
  let guard = 0;
  while (url.length > 3_000_000 && guard < 5) {
    const scale = Math.min(0.72, Math.sqrt(3_000_000 / url.length) * 0.9);
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(current.width * scale));
    small.height = Math.max(1, Math.round(current.height * scale));
    small.getContext("2d")?.drawImage(current, 0, 0, small.width, small.height);
    current = small;
    url = current.toDataURL("image/png");
    guard += 1;
  }
  return url;
}

/** PNG data URL of the cut-out, or null when the backdrop is too busy to lift. */
export async function layAsSticker(dataUrl: string): Promise<string | null> {
  const image = await loadImage(dataUrl);
  const max = 1400;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const lifted = cutBackground(pixels.data, width, height);
  if (!lifted) return null;
  context.putImageData(pixels, 0, 0);
  return toPng(outline(trimCanvas(canvas)));
}

function alphaStats(data: Uint8ClampedArray, width: number, height: number) {
  let clear = 0;
  let samples = 0;
  for (let i = 3; i < data.length; i += 16) {
    samples += 1;
    if (data[i] < 24) clear += 1;
  }
  const at = (x: number, y: number) => data[(y * width + x) * 4 + 3] ?? 255;
  const corners = [at(1, 1), at(width - 2, 1), at(1, height - 2), at(width - 2, height - 2)];
  const corner = corners.reduce((sum, value) => sum + value, 0) / corners.length;
  const center = at(width >> 1, height >> 1);
  return { clearRatio: samples ? clear / samples : 0, corner, center };
}

/** If the matte kept the backdrop and dropped the subject, flip it. */
function uninvert(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const stats = alphaStats(image.data, width, height);
  if (stats.center > 60 || stats.corner < 170) return;
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255 - image.data[i];
  context.putImageData(image, 0, 0);
}

function stackPush(seen: Uint8Array, opaque: (index: number) => boolean, stack: number[], index: number) {
  if (seen[index] || !opaque(index)) return;
  seen[index] = 1;
  stack.push(index);
}

function cleanMatte(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);
  const data = image.data;
  const total = width * height;
  let alpha = new Uint8Array(total);
  for (let i = 0; i < total; i++) alpha[i] = data[i * 4 + 3] < 64 ? 0 : data[i * 4 + 3];
  for (let round = 0; round < 2; round++) {
    const next = alpha.slice();
    for (let y = 2; y < height - 2; y++) {
      for (let x = 2; x < width - 2; x++) {
        const index = y * width + x;
        if (alpha[index] < 40) {
          next[index] = 0;
          continue;
        }
        let solid = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (alpha[(y + dy) * width + (x + dx)] > 170) solid += 1;
          }
        }
        if (solid < 14) next[index] = 0;
      }
    }
    alpha = next;
  }
  for (let i = 0; i < total; i++) data[i * 4 + 3] = alpha[i];
  const seen = new Uint8Array(total);
  const opaque = (index: number) => data[index * 4 + 3] > 48;
  const components: number[][] = [];
  for (let index = 0; index < total; index++) {
    if (seen[index] || !opaque(index)) continue;
    const stack = [index];
    const component: number[] = [];
    seen[index] = 1;
    while (stack.length) {
      const current = stack.pop() as number;
      component.push(current);
      const x = current % width;
      const y = (current - x) / width;
      if (x > 0) stackPush(seen, opaque, stack, current - 1);
      if (x < width - 1) stackPush(seen, opaque, stack, current + 1);
      if (y > 0) stackPush(seen, opaque, stack, current - width);
      if (y < height - 1) stackPush(seen, opaque, stack, current + width);
    }
    components.push(component);
  }
  const largest = components.reduce((max, item) => Math.max(max, item.length), 0);
  components.forEach((component) => {
    if (component.length >= largest * 0.12) return;
    component.forEach((index) => {
      data[index * 4 + 3] = 0;
    });
  });
  context.putImageData(image, 0, 0);
}

function tighten(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i] ?? 0;
    if (alpha < 28) data[i] = 0;
    else if (alpha < 90) data[i] = Math.round(alpha * 0.55);
  }
  context.putImageData(image, 0, 0);
}

/** PNG data URL when the canvas actually has a lifted subject. */
export function canvasToSticker(canvas: HTMLCanvasElement, soften = false): string | null {
  if (soften) {
    uninvert(canvas);
    cleanMatte(canvas);
    tighten(canvas);
  }
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const stats = alphaStats(data, width, height);
  if (stats.clearRatio < 0.06 || stats.clearRatio > 0.92) return null;
  if (stats.center < 40 && stats.corner < 40) return null;
  return toPng(outline(trimCanvas(canvas)));
}

/** Белая обводка вокруг вырезанного объекта — как у стикера из iPhone. */
export function outline(source: HTMLCanvasElement): HTMLCanvasElement {
  const pad = Math.max(4, Math.round(Math.max(source.width, source.height) * 0.028));
  const out = document.createElement("canvas");
  out.width = source.width + pad * 2;
  out.height = source.height + pad * 2;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  const white = document.createElement("canvas");
  white.width = source.width;
  white.height = source.height;
  const wctx = white.getContext("2d");
  if (!wctx) return source;
  wctx.drawImage(source, 0, 0);
  wctx.globalCompositeOperation = "source-in";
  wctx.fillStyle = "#ffffff";
  wctx.fillRect(0, 0, white.width, white.height);
  const steps = 24;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    ctx.drawImage(white, pad + Math.cos(angle) * pad, pad + Math.sin(angle) * pad);
  }
  ctx.drawImage(white, pad, pad);
  ctx.drawImage(source, pad, pad);
  return out;
}
