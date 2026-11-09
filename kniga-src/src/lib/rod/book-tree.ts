// Рост дерева на странице «Книга»: считается из заполненности книги (семья, места, фото, истории, документы) и числа страниц.

export const TREE_STAGES = [
  { file: "seed.webp", name: "Семя", from: 0 },
  { file: "sprout.webp", name: "Росток", from: 8 },
  { file: "young.webp", name: "Побег", from: 20 },
  { file: "young-alt.webp", name: "Молодое деревце", from: 38 },
  { file: "sakura-full.webp", name: "Цветущее деревце", from: 58 },
  { file: "full.webp", name: "Древо рода", from: 80 },
] as const;

/** Страниц, при которых вклад страниц в рост полный. */
export const TREE_FULL_PAGES = 30;

export type TreeGrowth = { stage: number; /** Путь до следующей стадии, 0..1; у последней всегда 1. */ progress: number; score: number };

/** Заполненность книги (0..100, `overallOf`) и число страниц превращаются в стадию дерева: семь десятых даёт заполненность, три десятых страницы. */
export function treeGrowth(overall: number, pageCount: number): TreeGrowth {
  const o = Number.isFinite(overall) ? Math.min(100, Math.max(0, overall)) : 0;
  const pagesPart = Math.min(100, (Math.max(0, pageCount) / TREE_FULL_PAGES) * 100);
  const score = Math.min(100, o * 0.7 + pagesPart * 0.3);
  let stage = 0;
  TREE_STAGES.forEach((s, i) => {
    if (score >= s.from) stage = i;
  });
  const next = TREE_STAGES[stage + 1];
  const progress = next ? (score - TREE_STAGES[stage]!.from) / (next.from - TREE_STAGES[stage]!.from) : 1;
  return { stage, progress: Math.min(1, Math.max(0, progress)), score };
}
