/**
 * Описание кисти. Цвета здесь нет — цвет задаётся отдельно и им же заливается контур.
 *
 * tip:
 *   "round"        — круглое перо, hardness 1 жёсткое, 0 мягкое
 *   "calligraphy"  — плоское перо, squeeze = высота/ширина, угол вдоль штриха
 *   "image"        — картинка кончика (PNG с прозрачностью). Её перекрашиваем в текущий цвет
 *
 * spacing — доля толщины между штампами (0.1 гладкая линия, 1 и больше — отдельные следы).
 * scatter, sizeJitter, opacityJitter — от 0 до 1.
 * angleMode — "fixed" | "direction" | "random".
 * angle — градусы, для fixed и как наклон каллиграфии.
 *
 * Формат пачки, которую можно принести файлом: rod-brush-pack/1
 * {
 *   "format": "rod-brush-pack/1",
 *   "brushes": [ { "id", "name", "tip", "spacing", ..., "image": "data:image/png;base64,..." } ]
 * }
 */

export const BRUSH_PACK_FORMAT = "rod-brush-pack/1";

/** @type {const} */
export const BUILTIN_BRUSHES = [
  {
    id: "pen",
    name: "Перо",
    tip: "round",
    spacing: 0.08,
    opacity: 1,
    hardness: 0.92,
    sizeJitter: 0,
    opacityJitter: 0,
    scatter: 0,
    angleMode: "fixed",
    angle: 0,
    pressureSize: true,
    defaultSize: 4,
    minSize: 1,
    maxSize: 48,
  },
  {
    id: "wash",
    name: "Акварель",
    tip: "round",
    spacing: 0.12,
    opacity: 0.28,
    hardness: 0.05,
    sizeJitter: 0.08,
    opacityJitter: 0.15,
    scatter: 0.04,
    angleMode: "fixed",
    angle: 0,
    pressureSize: true,
    defaultSize: 28,
    minSize: 8,
    maxSize: 120,
  },
  {
    id: "ink",
    name: "Тушь",
    tip: "round",
    spacing: 0.14,
    opacity: 0.85,
    hardness: 0.55,
    sizeJitter: 0.28,
    opacityJitter: 0.22,
    scatter: 0.12,
    angleMode: "fixed",
    angle: 0,
    pressureSize: true,
    defaultSize: 10,
    minSize: 2,
    maxSize: 64,
  },
  {
    id: "calligraphy",
    name: "Каллиграфия",
    tip: "calligraphy",
    spacing: 0.05,
    opacity: 1,
    hardness: 1,
    squeeze: 0.22,
    sizeJitter: 0,
    opacityJitter: 0,
    scatter: 0,
    angleMode: "direction",
    angle: -38,
    pressureSize: true,
    defaultSize: 18,
    minSize: 6,
    maxSize: 72,
  },
  {
    id: "charcoal",
    name: "Уголь",
    tip: "round",
    spacing: 0.18,
    opacity: 0.62,
    hardness: 0.2,
    sizeJitter: 0.45,
    opacityJitter: 0.3,
    scatter: 0.4,
    angleMode: "random",
    angle: 0,
    pressureSize: true,
    defaultSize: 22,
    minSize: 6,
    maxSize: 90,
  },
  {
    id: "stitch",
    name: "Шов",
    tip: "round",
    spacing: 1.55,
    opacity: 1,
    hardness: 1,
    sizeJitter: 0.05,
    opacityJitter: 0,
    scatter: 0.05,
    angleMode: "fixed",
    angle: 0,
    pressureSize: false,
    defaultSize: 7,
    minSize: 3,
    maxSize: 28,
  },
  {
    id: "leaf",
    name: "Лист",
    tip: "image",
    spacing: 0.92,
    opacity: 0.95,
    hardness: 1,
    sizeJitter: 0.18,
    opacityJitter: 0.05,
    scatter: 0.12,
    angleMode: "direction",
    angle: 0,
    pressureSize: false,
    defaultSize: 28,
    minSize: 12,
    maxSize: 96,
    procedural: "leaf",
  },
];

/**
 * Дополняет описание кисти значениями по умолчанию.
 * Чтобы добавить свою круглую кисть, достаточно id, name и пары полей.
 * @param {Record<string, unknown>} partial
 */
export function defineBrush(partial) {
  if (!partial || typeof partial.id !== "string" || !partial.id) {
    throw new TypeError("У кисти должен быть id");
  }
  const tip = partial.tip ?? "round";
  if (tip !== "round" && tip !== "calligraphy" && tip !== "image") {
    throw new TypeError(`Неизвестный tip кисти: ${String(tip)}`);
  }
  if (tip === "image" && !partial.image && !partial.procedural) {
    throw new TypeError("Кисти tip:image нужна картинка в поле image");
  }
  return {
    id: partial.id,
    name: typeof partial.name === "string" ? partial.name : partial.id,
    tip,
    spacing: num(partial.spacing, tip === "image" ? 0.85 : 0.1),
    opacity: num(partial.opacity, 1),
    hardness: num(partial.hardness, 0.9),
    squeeze: num(partial.squeeze, 0.25),
    sizeJitter: num(partial.sizeJitter, 0),
    opacityJitter: num(partial.opacityJitter, 0),
    scatter: num(partial.scatter, 0),
    angleMode: partial.angleMode ?? (tip === "calligraphy" ? "direction" : "fixed"),
    angle: num(partial.angle, tip === "calligraphy" ? -38 : 0),
    pressureSize: partial.pressureSize ?? tip !== "image",
    defaultSize: num(partial.defaultSize, 12),
    minSize: num(partial.minSize, 1),
    maxSize: num(partial.maxSize, 128),
    image: partial.image ?? null,
    procedural: partial.procedural ?? null,
    tint: partial.tint !== false,
  };
}

function num(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
