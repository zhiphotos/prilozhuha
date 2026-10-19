/** @typedef {{ r: number, g: number, b: number, a: number, css: string, unresolved?: boolean }} ParsedColor */

/**
 * @param {string} input
 * @returns {ParsedColor}
 */
export function parseColor(input) {
  if (typeof input !== "string" || !input.trim()) {
    throw new TypeError("Цвет должен быть строкой, например #8c3a3a");
  }
  const s = input.trim();
  if (s[0] === "#") {
    const hex = s.slice(1);
    if (![3, 4, 6, 8].includes(hex.length) || /[^0-9a-f]/i.test(hex)) {
      throw new TypeError(`Непонятный цвет: ${input}`);
    }
    const exp =
      hex.length <= 4 ? hex.split("").map((ch) => ch + ch).join("") : hex;
    const r = parseInt(exp.slice(0, 2), 16);
    const g = parseInt(exp.slice(2, 4), 16);
    const b = parseInt(exp.slice(4, 6), 16);
    const a = exp.length === 8 ? parseInt(exp.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a, css: s };
  }
  const m = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (!m) return { r: 0, g: 0, b: 0, a: 1, css: s, unresolved: true };
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
    css: s,
  };
}

/** @param {ParsedColor} c */
export function rgbaBytes(c) {
  return [
    clampByte(c.r),
    clampByte(c.g),
    clampByte(c.b),
    clampByte(Math.round(c.a * 255)),
  ];
}

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
