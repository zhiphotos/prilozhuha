import type { BookPage } from "@/lib/rod/types";

// Цвет сразу на всех страницах: фон страницы и цвет букв во всех текстах.
// Страницы и тексты со своим цветом по умолчанию не трогаем (keepCustom), обложку и заднюю сторону тоже (includeCover).
export type RecolorOptions = { bg?: string; text?: string; keepCustom: boolean; includeCover: boolean };
export type RecolorUndo = {
  pages: { id: string; bg: string | undefined }[];
  blocks: { pageId: string; blockId: string; color: string | undefined }[];
};
export type RecolorResult = { pages: BookPage[]; undo: RecolorUndo; pageCount: number; textCount: number };

const touchable = (page: BookPage, o: RecolorOptions) => o.includeCover || page.kind !== "cover";

/** Сколько страниц и текстов изменится. Нужно для подтверждения до применения. */
export function previewRecolor(pages: BookPage[], o: RecolorOptions): { pageCount: number; textCount: number } {
  let pageCount = 0;
  let textCount = 0;
  for (const page of pages) {
    if (!touchable(page, o)) continue;
    if (o.bg && page.bg !== o.bg && !(o.keepCustom && page.bg)) pageCount += 1;
    if (o.text) for (const b of page.blocks) if (b.type === "text" && b.color !== o.text && !(o.keepCustom && b.color)) textCount += 1;
  }
  return { pageCount, textCount };
}

export function recolorPages(pages: BookPage[], o: RecolorOptions): RecolorResult {
  const undo: RecolorUndo = { pages: [], blocks: [] };
  let pageCount = 0;
  let textCount = 0;
  const next = pages.map((page) => {
    if (!touchable(page, o)) return page;
    let out = page;
    if (o.bg && page.bg !== o.bg && !(o.keepCustom && page.bg)) {
      undo.pages.push({ id: page.id, bg: page.bg });
      out = { ...out, bg: o.bg };
      pageCount += 1;
    }
    if (o.text && page.blocks.some((b) => b.type === "text" && b.color !== o.text && !(o.keepCustom && b.color))) {
      out = {
        ...out,
        blocks: page.blocks.map((b) => {
          if (b.type !== "text" || b.color === o.text || (o.keepCustom && b.color)) return b;
          undo.blocks.push({ pageId: page.id, blockId: b.id, color: b.color });
          textCount += 1;
          return { ...b, color: o.text };
        }),
      };
    }
    return out;
  });
  return { pages: next, undo, pageCount, textCount };
}

/** Отмена одной операции: возвращает только цвета, которые меняла операция. Правки после неё (текст, положение) остаются. */
export function revertRecolor(pages: BookPage[], undo: RecolorUndo): BookPage[] {
  const bgs = new Map(undo.pages.map((p) => [p.id, p.bg]));
  const colors = new Map(undo.blocks.map((b) => [`${b.pageId}:${b.blockId}`, b.color]));
  return pages.map((page) => {
    let out = page;
    if (bgs.has(page.id)) out = { ...out, bg: bgs.get(page.id) };
    if (undo.blocks.some((b) => b.pageId === page.id)) {
      out = { ...out, blocks: out.blocks.map((b) => (b.type === "text" && colors.has(`${page.id}:${b.id}`) ? { ...b, color: colors.get(`${page.id}:${b.id}`) } : b)) };
    }
    return out;
  });
}
