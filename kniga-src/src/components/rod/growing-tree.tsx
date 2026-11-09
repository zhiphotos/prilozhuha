import { TREE_STAGES, type TreeGrowth } from "@/lib/rod/book-tree";

/** Дерево, которое растёт вместе с книгой: слева от кнопок на странице «Книга», на всю их высоту. */
export function GrowingTree({ growth }: { growth: TreeGrowth }) {
  const stage = TREE_STAGES[growth.stage] ?? TREE_STAGES[0];
  const pct = Math.round(growth.progress * 100);
  const last = growth.stage >= TREE_STAGES.length - 1;
  return (
    <figure className="m-0 flex w-[34%] max-w-[11rem] shrink-0 flex-col" aria-label={`Дерево книги: ${stage.name}`}>
      <div className="relative min-h-40 flex-1">
        {/* Новая стадия плавно проявляется на месте прежней. */}
        <img
          key={stage.file}
          src={`./book-tree/${stage.file}`}
          alt={`Дерево, стадия «${stage.name}»`}
          draggable={false}
          className="absolute inset-0 size-full book-tree-img object-contain object-bottom drop-shadow-md"
        />
      </div>
      <figcaption className="mt-2 text-center text-xs text-muted">
        <span className="block font-semibold text-ink">{stage.name}</span>
        <span className="block">{growth.stage + 1} из {TREE_STAGES.length}</span>
      </figcaption>
      {last ? null : (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Путь до следующей стадии" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i className="block h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
        </div>
      )}
    </figure>
  );
}
