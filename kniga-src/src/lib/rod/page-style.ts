// Общие размеры и рисунки страницы. Экран и PDF берут их отсюда, поэтому печать совпадает с тем, что видно.
// Все размеры — в процентах ширины страницы (на экране это единицы cqw).
import type { FontKind, PaperKind, StickerKind, TextLook } from "@/lib/rod/types";

/** Книга квадратная: страница на экране и в печати — квадрат. Размер в см выбирается при печати. */
export const PAGE_RATIO = 1;

export type BookSize = 20 | 25 | 30;
export const BOOK_SIZES: BookSize[] = [20, 25, 30];

/** Охранное поле от края обреза и от корешка, мм. */
export const SAFE_MM = 10;
export const GUTTER_MM = 15;

export type PrintSetup = { size: BookSize; bleed: number; spine: number };
export const DEFAULT_PRINT: PrintSetup = { size: 30, bleed: 5, spine: 10 };

/**
 * Безопасная зона страницы в % стороны листа.
 * side: "right" — правая страница разворота (корешок слева), "left" — левая, "single" — обложка.
 */
export function safeArea(size: BookSize, side: "left" | "right" | "single") {
  const safe = (SAFE_MM / (size * 10)) * 100;
  const gutter = (GUTTER_MM / (size * 10)) * 100;
  return {
    top: safe,
    bottom: safe,
    left: side === "right" ? gutter : safe,
    right: side === "left" ? gutter : safe,
  };
}

/** Чётные страницы книги — левые, нечётные — правые (обложка не считается). */
export function pageSide(index: number, hasCover: boolean): "left" | "right" | "single" {
  if (hasCover && index === 0) return "single";
  const n = hasCover ? index : index + 1;
  return n % 2 === 1 ? "right" : "left";
}

export const COLORS = {
  ink: "#2a2420",
  muted: "#7a7067",
  paper: "#fbf8f3",
  rose: "#c45d72",
  roseDeep: "#8e3d52",
  blush: "#f6d5dc",
  sage: "#6f8a68",
  sageSoft: "#dce6d6",
  night: "#2a2420",
  line: "#e6ddd1",
} as const;

export const PAPER: Record<PaperKind, { bg: string; label: string }> = {
  cream: { bg: "#fbf8f3", label: "Сливочная" },
  lined: { bg: "#fbf8f3", label: "В линейку" },
  dots: { bg: "#fbf8f3", label: "В точку" },
  rose: { bg: "#f8e4e8", label: "Розовая" },
  sage: { bg: "#e7eee2", label: "Шалфей" },
  kraft: { bg: "#ece0cf", label: "Крафт" },
};

export const FONT_FAMILY: Record<FontKind, string> = {
  serif: '"Cormorant Garamond", Georgia, serif',
  sans: '"Manrope Variable", "Manrope", system-ui, sans-serif',
  script: '"Caveat", "Segoe Script", cursive',
};

export const FONT_WEIGHT: Record<FontKind, number> = { serif: 600, sans: 500, script: 500 };

// В книге 25×25 см: sm ≈ 13–14 pt, md ≈ 19 pt, lg ≈ 34 pt. На 30×30 всё пропорционально крупнее.
const SIZE: Record<FontKind, Record<"sm" | "md" | "lg", number>> = {
  serif: { sm: 2.1, md: 2.9, lg: 5.2 },
  sans: { sm: 1.75, md: 2.3, lg: 4 },
  script: { sm: 2.8, md: 3.8, lg: 6.2 },
};

const LEADING: Record<FontKind, number> = { serif: 1.2, sans: 1.4, script: 1.1 };

export function textMetrics(font: FontKind, size: "sm" | "md" | "lg") {
  return { size: SIZE[font][size], leading: LEADING[font] };
}

/** Внутренние поля у карточки и плашки — в % ширины страницы. */
export function lookPad(look: TextLook | undefined): { x: number; y: number; radius: number } {
  if (look === "card") return { x: 2.4, y: 1.8, radius: 2 };
  if (look === "pill") return { x: 2, y: 0.7, radius: 50 };
  return { x: 0, y: 0, radius: 0 };
}

export function lookColors(look: TextLook | undefined): { bg: string; fg: string } {
  if (look === "card") return { bg: COLORS.night, fg: COLORS.paper };
  if (look === "pill") return { bg: COLORS.blush, fg: COLORS.roseDeep };
  return { bg: "transparent", fg: COLORS.ink };
}

/** Рамки фото: поля в % ширины блока. */
export const POLAROID = { side: 5, top: 5, bottom: 18 } as const;

type StickerArt = { label: string; ratio: number; svg: string };

const svg = (view: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`;

export const STICKERS: Record<Exclude<StickerKind, "bubble">, StickerArt> = {
  heart: {
    label: "Сердце",
    ratio: 0.92,
    svg: svg(
      "0 0 100 92",
      `<path d="M50 88C18 66 4 48 6 29 8 13 21 4 34 6c8 1 13 6 16 12 3-6 8-11 16-12 13-2 26 7 28 23 2 19-12 37-44 59z" fill="${COLORS.rose}" stroke="#fff" stroke-width="5" stroke-linejoin="round"/><path d="M24 22c-5 3-8 8-8 14" stroke="#fff" stroke-opacity=".6" stroke-width="5" fill="none" stroke-linecap="round"/>`,
    ),
  },
  star: {
    label: "Звезда",
    ratio: 0.95,
    svg: svg(
      "0 0 100 95",
      `<path d="M50 5l13 28 30 3-23 20 7 30-27-16-27 16 7-30L7 36l30-3z" fill="#e2b04f" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`,
    ),
  },
  sparkle: {
    label: "Искра",
    ratio: 1,
    svg: svg(
      "0 0 100 100",
      `<path d="M50 4c4 26 20 42 46 46-26 4-42 20-46 46-4-26-20-42-46-46 26-4 42-20 46-46z" fill="${COLORS.roseDeep}"/><path d="M82 8c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z" fill="${COLORS.rose}"/>`,
    ),
  },
  flower: {
    label: "Цветок",
    ratio: 1,
    svg: svg(
      "0 0 100 100",
      `<g fill="${COLORS.blush}" stroke="${COLORS.rose}" stroke-width="3">${[0, 72, 144, 216, 288]
        .map((a) => `<ellipse cx="50" cy="27" rx="15" ry="22" transform="rotate(${a} 50 50)"/>`)
        .join("")}</g><circle cx="50" cy="50" r="11" fill="#e2b04f"/>`,
    ),
  },
  leaf: {
    label: "Листик",
    ratio: 1,
    svg: svg(
      "0 0 100 100",
      `<path d="M14 88C14 44 44 12 90 10 88 56 58 86 14 88z" fill="${COLORS.sage}" stroke="#fff" stroke-width="4"/><path d="M18 84C40 62 58 42 80 20" stroke="#fff" stroke-opacity=".7" stroke-width="3" fill="none" stroke-linecap="round"/>`,
    ),
  },
  branch: {
    label: "Веточка",
    ratio: 0.5,
    svg: svg(
      "0 0 100 50",
      `<path d="M4 44C30 30 60 18 96 8" stroke="${COLORS.sage}" stroke-width="3" fill="none" stroke-linecap="round"/>${[
        [22, 34, -40],
        [36, 28, 30],
        [50, 23, -35],
        [64, 18, 35],
        [78, 13, -30],
        [90, 9, 30],
      ]
        .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="8" ry="3.6" transform="rotate(${r} ${x} ${y})" fill="${COLORS.sage}"/>`)
        .join("")}`,
    ),
  },
  home: {
    label: "Дом",
    ratio: 1,
    svg: svg(
      "0 0 100 100",
      `<path d="M12 48L50 14l38 34v40H12z" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="5" stroke-linejoin="round"/><path d="M40 88V62h20v26" fill="${COLORS.blush}" stroke="${COLORS.ink}" stroke-width="5"/><rect x="62" y="42" width="14" height="12" fill="#e2b04f" stroke="${COLORS.ink}" stroke-width="4"/>`,
    ),
  },
  sun: {
    label: "Солнце",
    ratio: 1,
    svg: svg(
      "0 0 100 100",
      `<g stroke="#e2b04f" stroke-width="6" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return `<line x1="${50 + Math.cos(a) * 32}" y1="${50 + Math.sin(a) * 32}" x2="${50 + Math.cos(a) * 45}" y2="${50 + Math.sin(a) * 45}"/>`;
      }).join("")}</g><circle cx="50" cy="50" r="22" fill="#f1c766"/>`,
    ),
  },
  seal: {
    label: "Печать",
    ratio: 1,
    svg: svg(
      "0 0 100 100",
      `<path d="M50 6c9 0 12 6 20 8s14 6 16 14-2 14 0 22-2 16-10 20-10 10-20 12-16 4-24 0-14-6-18-14-6-14-4-22-2-16 4-22 10-8 18-12 9-6 18-6z" fill="${COLORS.roseDeep}"/><circle cx="50" cy="50" r="26" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3"/><path d="M50 34l5 10 11 1-8 7 3 11-11-6-11 6 3-11-8-7 11-1z" fill="#fff" fill-opacity=".55"/>`,
    ),
  },
  envelope: {
    label: "Письмо",
    ratio: 0.7,
    svg: svg(
      "0 0 100 70",
      `<rect x="4" y="4" width="92" height="62" rx="4" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="4"/><path d="M6 8l44 32 44-32" fill="none" stroke="${COLORS.ink}" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="40" r="9" fill="${COLORS.rose}"/>`,
    ),
  },
  swirl: {
    label: "Стрелка",
    ratio: 0.6,
    svg: svg(
      "0 0 100 60",
      `<path d="M6 50C20 20 44 12 52 26 58 38 40 44 38 32 36 18 62 8 90 16" fill="none" stroke="${COLORS.ink}" stroke-width="3.5" stroke-linecap="round"/><path d="M80 6l12 10-14 6" fill="none" stroke="${COLORS.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
  },
  tape: {
    label: "Скотч",
    ratio: 0.26,
    svg: svg(
      "0 0 100 26",
      `<path d="M2 2h96l-3 4 3 4-3 4 3 4-3 4 3 2H2l3-4-3-4 3-4-3-4 3-4z" fill="${COLORS.blush}" fill-opacity=".9"/><path d="M8 7h84M8 19h84" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-dasharray="4 5"/>`,
    ),
  },
  "tape-sage": {
    label: "Скотч мята",
    ratio: 0.26,
    svg: svg(
      "0 0 100 26",
      `<path d="M2 2h96l-3 4 3 4-3 4 3 4-3 4 3 2H2l3-4-3-4 3-4-3-4 3-4z" fill="${COLORS.sageSoft}" fill-opacity=".95"/><g fill="#fff" fill-opacity=".7">${[14, 30, 46, 62, 78].map((x) => `<circle cx="${x}" cy="13" r="2.6"/>`).join("")}</g>`,
    ),
  },
};

export const STICKER_ORDER = Object.keys(STICKERS) as Array<keyof typeof STICKERS>;

export function stickerUrl(kind: StickerKind): string {
  const art = kind === "bubble" ? STICKERS.sparkle : STICKERS[kind];
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(art.svg)}`;
}

export function stickerRatio(kind: StickerKind): number {
  return kind === "bubble" ? 1 : STICKERS[kind].ratio;
}

export function defaultStickerWidth(kind: StickerKind): number {
  if (kind === "tape" || kind === "tape-sage") return 22;
  if (kind === "branch" || kind === "swirl") return 20;
  return 10;
}
