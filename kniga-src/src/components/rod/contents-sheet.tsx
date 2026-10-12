import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { blankPage } from "@/lib/rod/layouts";
import { useRod } from "@/lib/rod/store";
import type { BookPage, Chapter } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

/** Сколько на странице реально заполнено: фото, рисунки, текст с буквами. Подсказки и пустые плашки не считаются. */
export function filledCount(page: BookPage): number {
  return page.blocks.filter((b) => (b.type === "text" ? b.text.trim().length > 0 && !b.placeholder : b.type === "photo" || b.type === "ink" || b.type === "sticker" || b.type === "shape")).length;
}

function rangeOf(pages: BookPage[], id: string): { first: BookPage | null; label: string; count: number; filled: number } {
  const hasCover = pages[0]?.kind === "cover";
  const numbers: number[] = [];
  let first: BookPage | null = null;
  let filled = 0;
  pages.forEach((page, i) => {
    if (page.chapterId !== id) return;
    numbers.push(hasCover ? i : i + 1);
    first ??= page;
    if (filledCount(page) >= 2) filled += 1;
  });
  if (!numbers.length) return { first: null, label: "", count: 0, filled: 0 };
  const spans: string[] = [];
  let start = numbers[0];
  for (let k = 1; k <= numbers.length; k += 1) {
    if (numbers[k] !== numbers[k - 1] + 1) {
      spans.push(start === numbers[k - 1] ? `${start}` : `${start}–${numbers[k - 1]}`);
      start = numbers[k];
    }
  }
  return { first, label: `стр. ${spans.join(", ")}`, count: numbers.length, filled };
}

function milestone(percent: number): string {
  if (percent >= 100) return "Книга собрана. Можно листать и отправлять в печать.";
  if (percent >= 75) return `Собрано на ${percent}%. Осталось совсем немного, корешок уже держит форму.`;
  if (percent >= 50) return `Собрано на ${percent}%. Полпути пройдено.`;
  if (percent >= 25) return `Собрано на ${percent}%. Четверть пути, книга уже чувствуется в руках.`;
  return `Собрано на ${percent}%. Каждая страница делает её настоящей.`;
}

const CHEERS = ["Глава собрана. Одной историей в семье стало больше.", "Готово. Эту главу теперь можно держать в руках.", "Ещё одна глава на месте. Так книга и растёт.", "Красиво. Эта глава теперь дома."];

/** Живое оглавление: тап по главе открывает её страницы, галочка отмечает «готово». */
export function ContentsSheet({ onOpen, onClose, current }: { onOpen: (pageId: string) => void; onClose: () => void; current?: string }) {
  const pages = useRod((state) => state.pages);
  const plan = useRod((state) => state.plan);
  const toggle = useRod((state) => state.toggleChapter);
  const rename = useRod((state) => state.renameChapter);
  const remove = useRod((state) => state.removeChapter);
  const move = useRod((state) => state.moveChapter);
  const setPlan = useRod((state) => state.setPlan);
  const insertPage = useRod((state) => state.insertPage);
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState("");
  const [popped, setPopped] = useState<string | null>(null);

  const rows = useMemo(() => plan.map((c) => ({ c, ...rangeOf(pages, c.id) })), [plan, pages]);
  const doneCount = plan.filter((c) => c.done).length;
  const loose = pages.filter((p) => p.kind !== "cover" && !p.chapterId).length;
  const totalPlanned = plan.reduce((a, c) => a + c.planned, 0);
  const totalFilled = rows.reduce((a, r) => a + r.filled, 0);

  const addFirstPage = (c: Chapter) => {
    const at = pages.length;
    const id = insertPage({ ...blankPage(), chapterId: c.id, title: c.title }, at);
    onOpen(id);
  };

  return (
    <Sheet title="Содержание" onClose={onClose} className="!bg-paper">
      <div className="mb-3 rounded-2xl bg-white/70 p-3">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium text-ink">
            {plan.length ? `Готово глав: ${doneCount} из ${plan.length}` : "Оглавление пока пустое"}
          </p>
          {totalPlanned ? <p className="text-xs text-muted">заполнено страниц: {totalFilled} из {totalPlanned}</p> : null}
        </div>
        {/* «Корешок»: сегмент на главу, ширина по числу страниц, заливка по тому, сколько страниц уже живых */}
        <div className="mt-2 flex gap-1">
          {rows.map(({ c, filled }) => (
            <span key={c.id} className="h-2.5 overflow-hidden rounded-full bg-ink/10" style={{ flexGrow: Math.max(1, c.planned), flexBasis: 0 }}>
              <span className={cn("block h-full rounded-full bg-gradient-to-r from-rose to-[#e2a35f] transition-all duration-700", c.done && "opacity-100")} style={{ width: `${c.done ? 100 : Math.min(100, (filled / Math.max(1, c.planned)) * 100)}%` }} />
            </span>
          ))}
        </div>
        {totalPlanned ? <p className="mt-2 text-xs text-ink/70">{milestone(Math.round(((rows.reduce((a, r) => a + (r.c.done ? r.c.planned : Math.min(r.filled, r.c.planned)), 0)) / totalPlanned) * 100))}</p> : null}
      </div>

      {plan.length === 0 ? <p className="mb-3 text-sm text-muted">Нажмите «Спланировать страницы списком» на экране «Книга» или добавьте главу ниже.</p> : null}

      <ul className="grid gap-1.5">
        {rows.map(({ c, first, label, count, filled }, i) => (
          <li key={c.id} className={cn("rounded-2xl bg-white/70 p-1.5 transition", current && first && pages.find((p) => p.id === current)?.chapterId === c.id && "ring-2 ring-night", popped === c.id && "scale-[1.02]")}>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label={c.done ? "Снять отметку" : "Отметить главу готовой"}
                className={cn("grid size-11 shrink-0 place-items-center rounded-full border-2 transition", c.done ? "border-transparent bg-gradient-to-br from-rose to-[#e2a35f] text-white" : "border-ink/25 bg-white")}
                onClick={() => {
                  toggle(c.id);
                  if (!c.done) {
                    setPopped(c.id);
                    window.setTimeout(() => setPopped(null), 500);
                    if (typeof navigator.vibrate === "function") navigator.vibrate(14);
                    const empty = Math.max(0, c.planned - filled);
                    toast(empty > 0 && count > 0 ? `Отметила готовой, а пустых страниц ещё ${empty}. Так и оставим?` : CHEERS[(i + doneCount) % CHEERS.length], {
                      action: { label: "Вернуть в работу", onClick: () => toggle(c.id) },
                      duration: 5000,
                    });
                  }
                }}
              >
                {c.done ? <Check className="size-5" strokeWidth={3} /> : null}
              </button>
              {editing === c.id ? (
                <input
                  autoFocus={typeof window !== "undefined" && window.matchMedia("(hover:hover)").matches}
                  className="field !min-h-11 min-w-0 flex-1"
                  defaultValue={c.title}
                  onBlur={(event) => {
                    rename(c.id, event.target.value);
                    setEditing(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="min-h-14 min-w-0 flex-1 px-1 text-left"
                  onClick={() => (first ? onOpen(first.id) : addFirstPage(c))}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setEditing(c.id);
                  }}
                >
                  <span className={cn("block truncate text-[15px] font-semibold text-ink", c.done && "text-ink/75 line-through decoration-rose/60")}>{c.title}</span>
                  <span className="block text-xs text-muted">
                    {count ? `${label}${count < c.planned ? ` · ${count} из ${c.planned}` : ""}${filled ? ` · оформлено ${filled}` : ""}` : `пока нет страниц · нажмите, чтобы начать (${c.planned} запланировано)`}
                  </span>
                </button>
              )}
              <div className="flex shrink-0">
                <button type="button" aria-label="Переименовать" className="grid size-10 place-items-center rounded-full" onClick={() => setEditing(c.id)}>
                  <Pencil className="size-4" />
                </button>
                <button type="button" aria-label="Выше" disabled={i === 0} className="grid size-10 place-items-center rounded-full disabled:opacity-25" onClick={() => move(c.id, -1)}>
                  <ArrowUp className="size-4" />
                </button>
                <button type="button" aria-label="Ниже" disabled={i === rows.length - 1} className="grid size-10 place-items-center rounded-full disabled:opacity-25" onClick={() => move(c.id, 1)}>
                  <ArrowDown className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Удалить главу, страницы останутся"
                  className="grid size-10 place-items-center rounded-full text-rose-deep"
                  onClick={() => {
                    if (window.confirm(`Убрать главу «${c.title}» из оглавления? Страницы останутся в книге.`)) remove(c.id);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </li>
        ))}
        {loose ? (
          <li className="rounded-2xl bg-white/40 px-4 py-3 text-sm text-muted">Без главы · {loose} стр.</li>
        ) : null}
      </ul>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const title = fresh.trim();
          if (!title) return;
          setPlan([...plan, { id: crypto.randomUUID(), title, planned: 1, done: false }]);
          setFresh("");
        }}
      >
        <input className="field" value={fresh} onChange={(event) => setFresh(event.target.value)} placeholder="Новая глава" />
        <Button type="submit" variant="soft" disabled={!fresh.trim()}>
          <Plus className="size-4" /> Добавить
        </Button>
      </form>
      <p className="mt-2 text-xs text-muted">Нажмите на главу, чтобы перейти к её страницам. Карандаш переименует главу.</p>
    </Sheet>
  );
}
