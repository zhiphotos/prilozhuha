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
/** Ширина места под дерево на каждом уровне (доля ширины блока). Семя, росток и побег остаются слева и за кнопки не заходят, молодое и взрослое дерево выходят за них: чем выше уровень, тем больше эффект. */
const LEVEL_WIDTH = [0.17, 0.28, 0.42, 0.52, 0.66, 0.8] as const;
/** Левая зона, куда помещаются маленькие деревья (кнопки начинаются с 44%). */
export const SMALL_TREE_MAX = 0.45;

export const levelFile = (stage: number): (typeof LEVEL_FILES)[number] => LEVEL_FILES[Math.min(LEVEL_FILES.length - 1, Math.max(0, stage))]!;

/** Плавная ширина: между уровнями растёт вместе со шкалой, но маленькое дерево не заходит за левую зону. */
export function levelWidth(stage: number, progress: number): number {
  const s = Math.min(LEVEL_WIDTH.length - 1, Math.max(0, stage));
  if (s >= LEVEL_WIDTH.length - 1) return LEVEL_WIDTH[s]!;
  const p = Math.min(1, Math.max(0, progress));
  const target = s <= 2 ? Math.min(LEVEL_WIDTH[s + 1]!, SMALL_TREE_MAX) : LEVEL_WIDTH[s + 1]!;
  return LEVEL_WIDTH[s]! + (target - LEVEL_WIDTH[s]!) * p;
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
