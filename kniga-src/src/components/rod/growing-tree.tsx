import { useState } from "react";
import { Sheet } from "@/components/rod/chrome";
import { TREE_SEEDS, TREE_STAGES, isSeedId, levelFile, levelScale, type SeedId, type TreeGrowth } from "@/lib/rod/book-tree";

const KEY = "kniga-book-seed";

function savedSeed(): SeedId | null {
  try {
    const v = localStorage.getItem(KEY);
    if (isSeedId(v)) return v;
  } catch {
    /* ещё не выбрано */
  }
  return null;
}

const src = (seed: SeedId, file: string) => `${import.meta.env.BASE_URL}book-tree/${seed}/${file}.webp`;

/**
 * Дерево растёт на фоне блока кнопок: кнопки лежат поверх него, ничего не сужается.
 * Человек выбирает только семечко; какое дерево вырастет, видно по мере роста.
 * Блок занимает место родителя целиком (родитель `relative`), подпись и выбор семечка стоят внизу слева.
 */
export function GrowingTree({ growth }: { growth: TreeGrowth }) {
  const [seed, setSeed] = useState<SeedId | null>(savedSeed);
  const [picking, setPicking] = useState(false);
  const stage = TREE_STAGES[growth.stage] ?? TREE_STAGES[0];
  const pct = Math.round(growth.progress * 100);
  const last = growth.stage >= TREE_STAGES.length - 1;
  const shown: SeedId = seed ?? TREE_SEEDS[0].id;
  const scale = levelScale(growth.stage, growth.progress);
  const name = TREE_SEEDS.find((s) => s.id === shown)?.name ?? "";
  const pick = (next: SeedId) => {
    setSeed(next);
    setPicking(false);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* без запоминания */
    }
  };
  // Пока дерево маленькое (семя, росток), семечко можно поменять; взрослому дереву смена не нужна, и выбор не выдаст, какие бывают деревья.
  const canPick = seed === null || growth.stage <= 1;
  return (
    <figure className="pointer-events-none absolute inset-0 m-0" aria-label={`Дерево книги: ${stage.name}`}>
      {seed === null ? (
        // Пока семечко не выбрано, дерево не показываем: каким оно станет, должно остаться сюрпризом.
        <div className="pointer-events-auto absolute left-0 top-1/3 w-[40%] rounded-2xl bg-paper/70 p-3 text-sm text-ink backdrop-blur-sm">
          Выберите семечко, и оно начнёт расти вместе с вашей книгой.
        </div>
      ) : (
      <div className="absolute inset-x-0 top-0 bottom-[6.2rem]">
        <img
          key={`${shown}-${levelFile(growth.stage)}`}
          src={src(shown, levelFile(growth.stage))}
          alt={`Дерево, уровень «${stage.name}»`}
          draggable={false}
          className="size-full object-contain drop-shadow-md transition-transform duration-700"
          style={{ objectPosition: "18% 100%", transform: `scale(${scale})`, transformOrigin: "18% 100%" }}
        />
      </div>
      )}
      <figcaption className="pointer-events-auto absolute bottom-0 left-0 w-[40%] text-xs text-muted">
        <span className="block text-sm font-semibold text-ink">{seed ? `${stage.name} · «${name}»` : stage.name}</span>
        <span className="block">Уровень {growth.stage + 1} из {TREE_STAGES.length}</span>
        {last ? null : (
          <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label="Путь до следующего уровня" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <i className="block h-full rounded-full bg-gold transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </span>
        )}
        {canPick ? (
          <button type="button" className="mt-1.5 min-h-9 text-xs font-semibold text-moss underline underline-offset-2" onClick={() => setPicking(true)}>
            {seed ? "Другое семечко" : "Выбрать семечко"}
          </button>
        ) : null}
      </figcaption>
      {picking ? (
        <div className="pointer-events-auto">
          <Sheet title="Выберите семечко" onClose={() => setPicking(false)}>
            <p className="mb-3 text-sm text-muted">Какое дерево из него вырастет, вы узнаете, когда оно подрастёт. Оно растёт вместе с вашей книгой.</p>
            <div className="grid grid-cols-3 gap-2">
              {TREE_SEEDS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={seed === s.id}
                  onClick={() => pick(s.id)}
                  className={`flex flex-col items-center rounded-2xl border p-2 ${seed === s.id ? "border-ink bg-white" : "border-line bg-white/60"}`}
                >
                  <img src={src(s.id, "seed")} alt="" draggable={false} className="h-24 w-full object-contain" />
                  <span className="mt-1 text-xs font-semibold text-ink">{s.name}</span>
                </button>
              ))}
            </div>
          </Sheet>
        </div>
      ) : null}
    </figure>
  );
}
