// Рост дерева на странице «Книга»: считается из заполненности книги (семья, места, фото, истории, документы) и числа страниц.
// Дерево выбирается по семечку; каким оно станет, человек узнаёт, когда оно вырастет (на выборе видны только семена).

export const TREE_STAGES = [
  { name: "Семя", from: 0 },
  { name: "Росток", from: 8 },
  { name: "Побег", from: 20 },
  { name: "Молодое деревце", from: 38 },
  { name: "Взрослое деревце", from: 58 },
  { name: "Древо рода", from: 80 },
] as const;

/** Семена: картинки лежат в `public/book-tree/<id>/` (семя, росток, молодое, взрослое), взяты из DARA. Названия не выдают дерево. */
export const TREE_SEEDS = [
  { id: "creativity", name: "Замысел" },
  { id: "oak", name: "Корни" },
  { id: "pine", name: "Стойкость" },
  { id: "relax", name: "Покой" },
  { id: "sakura", name: "Нежность" },
  { id: "willow", name: "Память" },
] as const;

export type SeedId = (typeof TREE_SEEDS)[number]["id"];

export const isSeedId = (v: unknown): v is SeedId => TREE_SEEDS.some((s) => s.id === v);

/** Какая из четырёх картинок на каждом из шести уровней. */
const LEVEL_FILES = ["seed", "sprout", "sprout", "young", "young", "full"] as const;
/** Размер дерева на каждом уровне (доля от полного): дерево растёт, а не просто меняет картинку. */
const LEVEL_SCALE = [0.5, 0.58, 0.72, 0.8, 0.9, 1] as const;

export const levelFile = (stage: number): (typeof LEVEL_FILES)[number] => LEVEL_FILES[Math.min(LEVEL_FILES.length - 1, Math.max(0, stage))]!;

/** Плавный размер: между уровнями растёт вместе со шкалой. */
export function levelScale(stage: number, progress: number): number {
  const s = Math.min(LEVEL_SCALE.length - 1, Math.max(0, stage));
  const next = LEVEL_SCALE[Math.min(LEVEL_SCALE.length - 1, s + 1)]!;
  const p = Math.min(1, Math.max(0, progress));
  return LEVEL_SCALE[s]! + (next - LEVEL_SCALE[s]!) * p * (s < LEVEL_SCALE.length - 1 ? 1 : 0);
}

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
