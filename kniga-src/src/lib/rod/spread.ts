// Фото «через разворот»: лежит на одной странице, но заходит на соседнюю. Соседняя рисует его тень-копию со сдвигом на ширину листа.
import { useMemo } from "react";
import { pageSide } from "@/lib/rod/page-style";
import { useRod } from "@/lib/rod/store";
import type { BookPage, PageBlock } from "@/lib/rod/types";

/** Индекс страницы напротив (через корешок) или -1. */
export function partnerIndex(pages: BookPage[], index: number): number {
  if (index < 0) return -1;
  const hasCover = pages[0]?.kind === "cover";
  if (hasCover && index === 0) return -1;
  const no = hasCover ? index : index + 1;
  const partnerNo = no % 2 === 1 ? no - 1 : no + 1;
  if (partnerNo < 2) return -1;
  const at = hasCover ? partnerNo : partnerNo - 1;
  return at < pages.length ? at : -1;
}

export function spreadGhosts(pages: BookPage[], pageId: string): PageBlock[] {
  const index = pages.findIndex((page) => page.id === pageId);
  const at = partnerIndex(pages, index);
  if (at < 0) return [];
  const partner = pages[at];
  const mine = pageSide(index, pages[0]?.kind === "cover");
  // Если я справа, партнёр слева: его блок виден у меня со сдвигом на −100 % (после корешка). Если я слева, сдвиг +100 %.
  const shift = mine === "right" ? 100 : -100;
  return partner.blocks
    .filter((block) => "spread" in block && block.spread && !block.clip)
    .map((block) => ({ ...block, id: `ghost:${block.id}`, x: block.x - shift, locked: true }) as PageBlock);
}

/** Тень-копии для страницы по её номеру в книге. */
export function useGhosts(pageId: string): PageBlock[] {
  const pages = useRod((state) => state.pages);
  return useMemo(() => spreadGhosts(pages, pageId), [pages, pageId]);
}

export const isGhostId = (id: string) => id.startsWith("ghost:");

/** Место копии среди блоков страницы: 0 – самая нижняя, blocks.length – поверх всех. */
export function ghostPosition(blocks: PageBlock[], ghostUnder: string | null | undefined): number {
  if (ghostUnder === null) return blocks.length;
  if (ghostUnder === undefined) return 0;
  const at = blocks.findIndex((b) => b.id === ghostUnder);
  return at < 0 ? 0 : at;
}

/** Блоки страницы вместе с копиями через разворот, каждая копия на своём месте по порядку слоёв. */
export function mergeGhosts(blocks: PageBlock[], ghosts: PageBlock[]): PageBlock[] {
  if (!ghosts.length) return blocks;
  const out: PageBlock[] = [];
  const at = (i: number) => ghosts.filter((g) => ghostPosition(blocks, g.ghostUnder) === i);
  blocks.forEach((b, i) => {
    out.push(...at(i), b);
  });
  out.push(...at(blocks.length));
  return out;
}
