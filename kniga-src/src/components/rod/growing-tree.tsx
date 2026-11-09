import { useEffect, useState } from "react";
import { Sheet } from "@/components/rod/chrome";
import { TREE_SEEDS, TREE_STAGES, isSeedId, levelFile, levelWidth, type SeedId, type TreeGrowth } from "@/lib/rod/book-tree";

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

const STAGE_KEY = "kniga-book-stage";
/** Положения светлячков вокруг дерева (проценты места под дерево) и их ритм: у каждого свой, чтобы не мигали вместе. */
const FLIES = [
  { x: 8, y: 22, td: 2.6, dd: 8, dl: 0, fx: 10, fy: -14 }, { x: 30, y: 8, td: 3.4, dd: 11, dl: 0.6, fx: -8, fy: -10 }, { x: 55, y: 18, td: 2.9, dd: 9, dl: 1.1, fx: 12, fy: -12 },
  { x: 78, y: 10, td: 3.8, dd: 12, dl: 0.3, fx: -10, fy: -16 }, { x: 92, y: 30, td: 2.7, dd: 10, dl: 1.7, fx: -12, fy: -8 }, { x: 15, y: 48, td: 3.1, dd: 13, dl: 0.9, fx: 9, fy: -10 },
  { x: 45, y: 40, td: 3.6, dd: 9, dl: 2.0, fx: -9, fy: -14 }, { x: 70, y: 46, td: 2.8, dd: 12, dl: 0.4, fx: 11, fy: -9 }, { x: 25, y: 70, td: 3.3, dd: 10, dl: 1.4, fx: -10, fy: -12 },
  { x: 60, y: 66, td: 3.0, dd: 14, dl: 2.3, fx: 8, fy: -15 }, { x: 86, y: 60, td: 2.5, dd: 8, dl: 0.7, fx: -9, fy: -11 }, { x: 40, y: 85, td: 3.7, dd: 11, dl: 1.9, fx: 10, fy: -13 },
] as const;

const src = (seed: SeedId, file: string) => `${import.meta.env.BASE_URL}book-tree/${seed}/${file}.webp`;

/**
 * Дерево растёт на фоне блока кнопок: кнопки лежат поверх него, ничего не сужается.
 * Человек выбирает только семечко; какое дерево вырастет, видно по мере роста.
 * Блок занимает место родителя целиком (родитель `relative`), подпись и выбор семечка стоят внизу слева.
 */
export function GrowingTree({ growth, onHide }: { growth: TreeGrowth; onHide: () => void }) {
  const [seed, setSeed] = useState<SeedId | null>(savedSeed);
  const [picking, setPicking] = useState(false);
  const stage = TREE_STAGES[growth.stage] ?? TREE_STAGES[0];
  const pct = Math.round(growth.progress * 100);
  const last = growth.stage >= TREE_STAGES.length - 1;
  const shown: SeedId = seed ?? TREE_SEEDS[0].id;
  const width = levelWidth(growth.stage, growth.progress);
  // Светлячки: дерево близко к новому уровню или только что выросло (уровень выше, чем в прошлый раз).
  const [grew, setGrew] = useState(false);
  useEffect(() => {
    let saved: number | null = null;
    try {
      const raw = localStorage.getItem(STAGE_KEY);
      saved = raw === null ? null : Number(raw);
      localStorage.setItem(STAGE_KEY, String(growth.stage));
    } catch {
      /* без запоминания */
    }
    if (saved !== null && Number.isFinite(saved) && growth.stage > saved) {
      setGrew(true);
      const id = window.setTimeout(() => setGrew(false), 12000);
      return () => window.clearTimeout(id);
    }
  }, [growth.stage]);
  const near = !last && growth.progress >= 0.7;
  const flies = grew ? FLIES.length : near ? 7 : 0;
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
      <div className="absolute left-0 top-0 bottom-[6.2rem] transition-[width] duration-[900ms] ease-out" style={{ width: `${width * 100}%` }}>
        <img
          key={`${shown}-${levelFile(growth.stage)}`}
          src={src(shown, levelFile(growth.stage))}
          alt={`Дерево, уровень «${stage.name}»`}
          draggable={false}
          className="size-full object-contain drop-shadow-md"
          style={{ objectPosition: "0% 100%" }}
        />
        {FLIES.slice(0, flies).map((f, i) => (
          <i key={i} className="book-fly" style={{ left: `${f.x}%`, top: `${f.y}%`, ["--td" as string]: `${f.td}s`, ["--dd" as string]: `${f.dd}s`, ["--dl" as string]: `${f.dl}s`, ["--fx" as string]: `${f.fx}px`, ["--fy" as string]: `${f.fy}px` }} />
        ))}
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
        <button type="button" className="block min-h-9 text-xs text-muted underline underline-offset-2" onClick={onHide}>
          Выключить дерево
        </button>
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
