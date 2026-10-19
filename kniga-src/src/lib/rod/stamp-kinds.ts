import type { BrushKind } from "@/lib/rod/types";

export type StampKind = "wash" | "ink" | "calligraphy" | "charcoal" | "stitch" | "leaf";
export const STAMP_KINDS: StampKind[] = ["wash", "ink", "calligraphy", "charcoal", "stitch", "leaf"];
export const isStampBrush = (brush: BrushKind | undefined): brush is StampKind => Boolean(brush) && (STAMP_KINDS as string[]).includes(brush as string);

/** Размер по умолчанию в пикселях страницы (страница = 1000 px). */
export const STAMP_DEFAULT_PX: Record<StampKind, number> = { wash: 44, ink: 12, calligraphy: 22, charcoal: 28, stitch: 9, leaf: 38 };
export const STAMP_LABELS: Record<StampKind, { label: string; hint: string }> = {
  wash: { label: "Акварель", hint: "Мягкое прозрачное пятно" },
  ink: { label: "Тушь", hint: "Живая линия с крапинами" },
  calligraphy: { label: "Каллиграфия", hint: "Плоское перо с наклоном" },
  charcoal: { label: "Уголь", hint: "Зернистый, шероховатый" },
  stitch: { label: "Шов", hint: "Стежки с просветами" },
  leaf: { label: "Лист", hint: "Листики вдоль линии" },
};

