// Закрепление размера букв. Причина жалоб «после обновления шрифты и размеры поплыли»: у текста без `px` размер берётся из таблицы
// SIZE в page-style.ts (S/M/L/XL по виду шрифта). Когда обновление правило таблицу (так было в 4e8af70: новые размеры, межстрочье,
// серый «serif» стал Manrope), менялись все такие тексты, а тексты с заданным `px` нет. Отсюда «не на всех страницах, а выборочно».
// Теперь каждому тексту при сохранении записывается его размер в px, и правка таблиц больше не двигает уже сделанные книги.
import { textMetrics } from "@/lib/rod/page-style";
import type { BookPage, PageBlock } from "@/lib/rod/types";

type TextBlock = Extract<PageBlock, { type: "text" }>;

/** px, при котором textMetrics даёт тот же размер, что давал токен S/M/L/XL. */
export function pinnedPx(block: Pick<TextBlock, "font" | "size">): number {
  const scale = block.font === "serif" ? 0.82 : 1; // тот же множитель, что в textMetrics для старого «serif»
  return Math.round(((textMetrics(block.font, block.size).size * 10) / scale) * 10) / 10;
}

/** Записывает px всем текстам без px. Если менять нечего, возвращает тот же массив (подписка на store не зацикливается). */
export function freezeTextSizes(pages: BookPage[]): BookPage[] {
  let changed = false;
  const next = pages.map((page) => {
    let touched = false;
    const blocks = page.blocks.map((block) => {
      if (block.type !== "text" || block.px) return block;
      touched = true;
      return { ...block, px: pinnedPx(block) } as PageBlock;
    });
    if (!touched) return page;
    changed = true;
    return { ...page, blocks };
  });
  return changed ? next : pages;
}
