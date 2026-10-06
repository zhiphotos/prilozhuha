import { useMemo, useState } from "react";
import { ArrowLeftRight, BookOpen, Lock, ChevronLeft, ChevronRight, Download, Plus, Printer, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, ScreenFrame, Sheet, TopBar, useNav } from "@/components/rod/chrome";
import { PageSheet } from "@/components/rod/page-view";
import { FULL_BOOK, FULL_BOOK_PAGES, fullBookPages } from "@/lib/rod/full-book";
import { blankPage, coverPage, pageFromPhoto, pageFromPrompt, pageFromStory } from "@/lib/rod/layouts";
import { PAGE_PROMPTS } from "@/lib/rod/pages";
import { isBookReady, overallOf, partsOf, plural } from "@/lib/rod/progress";
import { downloadFamilyBook, downloadPrintBlock, downloadPrintCover } from "@/lib/rod/print-book";
import { useRod } from "@/lib/rod/store";
import type { BookPage, PaperKind } from "@/lib/rod/types";
import { BOOK_SIZES, GUTTER_MM, PAPER, SAFE_MM } from "@/lib/rod/page-style";
import { cn } from "@/lib/cn";

export function BookScreen() {
  const nav = useNav();
  const data = useRod();
  const { pages, trash, stories, photos, people, addPage, restorePage, purgeTrash } = data;
  const meta = { dedicatee: data.dedicatee, collector: data.collector };
  const [library, setLibrary] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const snapshot = { ...data, pages };
  const overall = overallOf(partsOf(snapshot));
  const ready = isBookReady(snapshot, overall) || pages.length >= 6;
  const name = data.dedicatee.trim() || data.collector.trim();

  const open = (page: Omit<BookPage, "id"> | null, at?: number) => {
    if (!page) return;
    const id = addPage(page);
    if (at !== undefined) useRod.getState().placePage(id, at);
    nav.go({ id: "editor", pageId: id });
  };

  const usedPrompts = new Set(pages.map((page) => page.promptId).filter(Boolean));
  const missing = PAGE_PROMPTS.filter((prompt) => !usedPrompts.has(prompt.id));
  const storyOut = stories.filter((story) => !usedPrompts.has(`story:${story.id}`));
  const usedSrc = new Set(pages.flatMap((page) => page.blocks.map((block) => (block.type === "photo" ? block.src : ""))));
  const photoOut = photos.filter((photo) => !usedSrc.has(photo.dataUrl));
  const noMaiden = people.filter((person) => /бабуш|мам/i.test(person.relation) && !person.maidenName.trim());
  const hasCover = pages.some((page) => page.kind === "cover");


  return (
    <ScreenFrame>
      <TopBar kicker="Моя книга" title={name ? `Книга рода · ${name}` : "Книга рода"} />

      <div className="mb-5 grid grid-cols-[1fr_auto] gap-2 sm:flex">
        <Button className="min-h-12" disabled={pages.length === 0} onClick={() => nav.go({ id: "flip" })}>
          <BookOpen className="size-4" /> Листать книгу
        </Button>
        <Button variant="soft" className="min-h-12" disabled={pages.length === 0} onClick={() => setPrinting(true)}>
          <Printer className="size-4" /> Печать
        </Button>
      </div>

      {!hasCover ? (
        <button type="button" onClick={() => open(coverPage(meta), 0)} className="aurora mb-5 flex w-full items-center gap-4 rounded-[2rem] p-5 text-left">
          <div className="w-20 shrink-0 overflow-hidden rounded-md shadow-lg">
            <PageSheet page={{ id: "c", ...coverPage(meta) }} meta={meta} />
          </div>
          <span>
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">Начните отсюда</span>
            <span className="display-title mt-1 block text-3xl text-ink">Открыть обложку</span>
            <span className="mt-1 block text-sm text-ink/70">Для кого книга — уже первая страница.</span>
          </span>
        </button>
      ) : null}

      <FullTemplate pages={pages} meta={meta} />

      <PageGrid pages={pages} meta={meta} onOpen={(id) => nav.go({ id: "editor", pageId: id })} onAdd={() => setLibrary(true)} />

      <section className="glass mt-8 rounded-[2rem] p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-rose-deep" />
          <h2 className="display-title text-2xl text-ink">Чего не хватает книге</h2>
        </div>
        <div className="mt-4 grid gap-4">
          {storyOut.length > 0 ? (
            <Suggest title="Истории, которых ещё нет на страницах">
              {storyOut.slice(0, 6).map((story) => (
                <Chip key={story.id} onClick={() => open({ ...pageFromStory(story.title, story.narrative), promptId: `story:${story.id}` })}>
                  + {story.title}
                </Chip>
              ))}
            </Suggest>
          ) : null}
          {photoOut.length > 0 ? (
            <Suggest title={`${plural(photoOut.length, "фотография", "фотографии", "фотографий")} из архива ещё не в книге`}>
              {photoOut.slice(0, 4).map((photo) => (
                <Chip key={photo.id} onClick={() => open(pageFromPhoto(photo.dataUrl, [photo.who, photo.year].filter(Boolean).join(", "), [photo.what, photo.where && `Где: ${photo.where}`, photo.photographer && `Снимал(а): ${photo.photographer}`].filter(Boolean).join("\n")))}>
                  + {photo.who || "Фото"}
                </Chip>
              ))}
            </Suggest>
          ) : null}
          {missing.length > 0 ? (
            <Suggest title="Страницы, которые ещё не открыты">
              {missing.slice(0, 8).map((prompt) => (
                <Chip key={prompt.id} onClick={() => open(pageFromPrompt(prompt.id))}>
                  + {prompt.title}
                </Chip>
              ))}
            </Suggest>
          ) : null}
          {noMaiden.length > 0 ? (
            <Suggest title="Узнать девичью фамилию">
              {noMaiden.map((person) => (
                <Chip key={person.id} onClick={() => nav.go({ id: "archive", tab: "people" })}>
                  {person.name || person.relation}
                </Chip>
              ))}
            </Suggest>
          ) : null}
          {storyOut.length + photoOut.length + missing.length + noMaiden.length === 0 ? <p className="text-sm text-muted">Всё собранное уже стоит на страницах. Самое время листать.</p> : null}
        </div>
      </section>

      <section className={cn("mt-4 rounded-[2rem] p-5", ready ? "aurora" : "glass")}>
        <h2 className="display-title text-2xl text-ink">
          {ready ? "Ты собрал(а) материал для первой Книги рода" : "Когда страниц станет больше"}
        </h2>
        <p className="mt-2 text-sm text-ink/70">
          {ready
            ? "Не знаешь, как превратить эти материалы в настоящую историю семьи? В программе — главы, голос и сборка книги."
            : `${plural(pages.length, "страница", "страницы", "страниц")} в книге. Курс подождёт, пока захочется собрать из этого историю.`}
        </p>
        <Button className="mt-4" variant={ready ? "primary" : "soft"} onClick={() => nav.tab({ id: "lessons" })}>
          Программа «Книга рода»
        </Button>
      </section>

      {trash.length > 0 ? (
        <section className="mt-4">
          <button type="button" className="flex items-center gap-2 text-sm text-muted" onClick={() => setShowTrash((v) => !v)}>
            <Trash2 className="size-4" /> Корзина · {trash.length}
          </button>
          {showTrash ? (
            <div className="mt-3">
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {trash.map((item) => (
                  <li key={item.page.id} className="opacity-90">
                    <div className="thumb-shadow overflow-hidden rounded-[6px] grayscale-[40%]">
                      <PageSheet page={item.page} meta={meta} />
                    </div>
                    <button type="button" className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-deep" onClick={() => restorePage(item.page.id)}>
                      <RotateCcw className="size-3" /> Вернуть
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="mt-3 text-xs text-muted underline" onClick={() => purgeTrash()}>
                Очистить корзину навсегда
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {printing ? <PrintSheet pages={pages} meta={meta} onClose={() => setPrinting(false)} /> : null}
      {library ? <Library meta={meta} onClose={() => setLibrary(false)} onPick={(page) => { setLibrary(false); open(page); }} /> : null}
    </ScreenFrame>
  );
}

function Suggest({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-sm text-muted">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-full bg-white/80 px-3.5 py-2 text-sm font-medium text-ink shadow-[0_6px_16px_-10px_rgba(42,36,32,.4)] active:scale-[0.97]">
      {children}
    </button>
  );
}

function Library({ meta, onClose, onPick }: { meta: { dedicatee: string; collector: string }; onClose: () => void; onPick: (page: Omit<BookPage, "id">) => void }) {
  const templates = useMemo(() => PAGE_PROMPTS.map((prompt) => ({ prompt, page: pageFromPrompt(prompt.id) })), []);
  return (
    <Sheet title="Новая страница" onClose={onClose} className="max-w-2xl">
      <p className="mb-2 text-sm text-muted">Чистый лист</p>
      <div className="no-scrollbar -mx-1 mb-5 flex gap-3 overflow-x-auto px-1 pb-2">
        {(Object.keys(PAPER) as PaperKind[]).map((paper) => (
          <button key={paper} type="button" className="w-20 shrink-0 text-left" onClick={() => onPick({ ...blankPage(), paper })}>
            <div className="thumb-shadow overflow-hidden rounded-[4px]">
              <PageSheet page={{ id: paper, ...blankPage(), paper }} meta={meta} />
            </div>
            <span className="mt-1 block text-xs text-ink">{PAPER[paper].label}</span>
          </button>
        ))}
      </div>
      <p className="mb-2 text-sm text-muted">Готовые страницы — с рамками под фото и вопросами</p>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {templates.map(({ prompt, page }) =>
          page ? (
            <li key={prompt.id}>
              <button type="button" className="block w-full text-left" onClick={() => onPick(pageFromPrompt(prompt.id) ?? page)}>
                <div className="thumb-shadow overflow-hidden rounded-[4px]">
                  <PageSheet page={{ id: prompt.id, ...page }} meta={meta} editing />
                </div>
                <span className="mt-1 block text-xs font-medium leading-tight text-ink">{prompt.title}</span>
              </button>
            </li>
          ) : null,
        )}
      </ul>
    </Sheet>
  );
}

function PrintSheet({ pages, meta, onClose }: { pages: BookPage[]; meta: { dedicatee: string; collector: string }; onClose: () => void }) {
  const print = useRod((state) => state.print);
  const setPrint = useRod((state) => state.setPrint);
  const [busy, setBusy] = useState<string | null>(null);
  const inner = pages.filter((page) => page.kind !== "cover").length;
  const total = inner + (inner % 2);
  const run = (label: string, job: () => Promise<unknown>) => {
    setBusy(label);
    void job()
      .then(() => toast("Файл сохранён в «Загрузки»"))
      .catch((error: unknown) => toast(error instanceof Error ? error.message : "Файл не собрался"))
      .finally(() => setBusy(null));
  };
  return (
    <Sheet title="Файл для типографии" onClose={onClose}>
      <p className="text-sm text-muted">Формат книги</p>
      <div className="mt-2 flex gap-2">
        {BOOK_SIZES.map((size) => (
          <button key={size} type="button" onClick={() => setPrint({ size })} className={cn("flex-1 rounded-2xl px-3 py-3 text-center", print.size === size ? "bg-night text-paper" : "bg-white/70 text-ink")}>
            <span className="block text-lg font-semibold">
              {size}×{size}
            </span>
            <span className="text-xs opacity-70">см</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Вылеты, мм</span>
          <select className="field" value={print.bleed} onChange={(event) => setPrint({ bleed: Number(event.target.value) })}>
            {[3, 4, 5].map((mm) => (
              <option key={mm} value={mm}>
                {mm} мм с каждой стороны
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-muted">Корешок, мм</span>
          <input className="field" type="number" min={0} max={80} value={print.spine} onChange={(event) => setPrint({ spine: Math.max(0, Number(event.target.value) || 0) })} />
        </label>
      </div>
      <div className="mt-4 grid gap-2">
        <Button className="min-h-12" disabled={Boolean(busy) || inner === 0} onClick={() => run("block", () => downloadPrintBlock(pages, meta, print, (d, t) => setBusy(`Страница ${d + 1} из ${t}…`)))}>
          <Download className="size-4" /> {busy && busy !== "cover" && busy !== "preview" ? busy : `Блок страниц · ${total} стр.`}
        </Button>
        <Button variant="soft" className="min-h-12" disabled={Boolean(busy)} onClick={() => run("cover", () => downloadPrintCover(pages, meta, print))}>
          <Download className="size-4" /> {busy === "cover" ? "Собираю обложку…" : "Обложка разворотом"}
        </Button>
        <Button variant="ghost" disabled={Boolean(busy)} onClick={() => run("preview", () => downloadFamilyBook(pages, meta))}>
          Просмотр всей книги одним файлом
        </Button>
      </div>
      <div className="mt-5 rounded-3xl bg-white/60 p-4 text-sm text-ink">
        <p className="font-semibold">Что внутри файлов</p>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-ink/80">
          <li>
            Страница {print.size}×{print.size} см + вылеты {print.bleed} мм: файл {print.size * 10 + print.bleed * 2}×{print.size * 10 + print.bleed * 2} мм, 300 dpi, RGB.
          </li>
          <li>Обрезной формат отмечен в PDF (TrimBox) — типография увидит, где резать.</li>
          <li>
            Охранное поле {SAFE_MM} мм от края и {GUTTER_MM} мм у корешка — в редакторе это пунктир.
          </li>
          <li>Блок — без обложки, число страниц чётное: если нужно, в конце добавлена чистая.</li>
          <li>Обложка — один разворот: задник + корешок + лицо, с вылетами по краям.</li>
        </ul>
        <p className="mt-3 font-semibold">Перед заказом спросите в типографии</p>
        <ul className="mt-2 grid list-disc gap-1 pl-5 text-ink/80">
          <li>сколько мм вылетов и нужен ли «загиб» для твёрдой обложки (обычно 15–20 мм вместо вылета);</li>
          <li>толщину корешка для {total} страниц — впишите её выше;</li>
          <li>минимальное число страниц и кратность (часто 20+ и кратно 2 или 4);</li>
          <li>принимают ли RGB или нужен CMYK — большинство фотокниг печатают из RGB.</li>
        </ul>
      </div>
    </Sheet>
  );
}

/** Миниатюры страниц. В режиме «Порядок» страницы перетаскиваются пальцем или сдвигаются стрелками. */
function PageGrid({ pages, meta, onOpen, onAdd }: { pages: BookPage[]; meta: { dedicatee: string; collector: string }; onOpen: (id: string) => void; onAdd: () => void }) {
  const placePage = useRod((state) => state.placePage);
  const removePages = useRod((state) => state.removePages);
  const restorePage = useRod((state) => state.restorePage);
  const [arrange, setArrange] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmAll, setConfirmAll] = useState(false);

  const drop = (ids: string[]) => {
    if (!ids.length) return;
    removePages(ids);
    setPicked([]);
    toast(ids.length === 1 ? "Страница в корзине" : `${ids.length} страниц в корзине`, {
      action: { label: "Вернуть", onClick: () => [...ids].reverse().forEach((id) => restorePage(id)) },
      duration: 8000,
    });
  };
  const [drag, setDrag] = useState<{ id: string; pointerId: number; dx: number; dy: number; x0: number; y0: number; over: number } | null>(null);
  const first = pages[0]?.kind === "cover" ? 1 : 0;

  const move = (id: string, to: number) => {
    const target = Math.max(first, Math.min(pages.length - 1, to));
    placePage(id, target);
  };

  const onDown = (event: React.PointerEvent, page: BookPage, index: number) => {
    if (!arrange) return;
    if ((event.target as HTMLElement).closest("button[aria-label]")) return;
    if (page.kind === "cover") {
      setPicked((list) => (list.includes(page.id) ? list.filter((id) => id !== page.id) : [...list, page.id]));
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ id: page.id, pointerId: event.pointerId, dx: 0, dy: 0, x0: event.clientX, y0: event.clientY, over: index });
  };

  const onMove = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const hit = document.elementsFromPoint(event.clientX, event.clientY).find((el) => el instanceof HTMLElement && el.dataset.idx && el.dataset.drag !== "1") as HTMLElement | undefined;
    const over = hit ? Number(hit.dataset.idx) : drag.over;
    setDrag({ ...drag, dx: event.clientX - drag.x0, dy: event.clientY - drag.y0, over: Math.max(first, over) });
  };

  const onUp = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const from = pages.findIndex((page) => page.id === drag.id);
    const moved = Math.hypot(drag.dx, drag.dy) > 8;
    if (moved && from !== drag.over) move(drag.id, drag.over);
    // Простое касание без перетаскивания — выбрать страницу.
    if (!moved) setPicked((list) => (list.includes(drag.id) ? list.filter((id) => id !== drag.id) : [...list, drag.id]));
    setDrag(null);
  };

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{arrange ? "Тащите — поменять место. Коснитесь — выбрать." : `${plural(pages.length, "страница", "страницы", "страниц")}`}</p>
        {pages.length > 0 ? (
          <Button variant={arrange ? "primary" : "soft"} className="min-h-10 shrink-0 px-4" onClick={() => { setArrange((v) => !v); setPicked([]); setConfirmAll(false); }}>
            {arrange ? "Готово" : <><ArrowLeftRight className="size-4" /> Порядок и удаление</>}
          </Button>
        ) : null}
      </div>
      {arrange ? (
        <div className="glass sticky top-2 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-[1.4rem] p-2">
          <Button variant="white" className="min-h-10 px-3" onClick={() => setPicked(picked.length === pages.length ? [] : pages.map((page) => page.id))}>
            {picked.length === pages.length ? "Снять выбор" : "Выбрать все"}
          </Button>
          <Button className="min-h-10 px-3" variant="night" disabled={!picked.length} onClick={() => drop(picked)}>
            <Trash2 className="size-4" /> Удалить выбранные{picked.length ? ` · ${picked.length}` : ""}
          </Button>
          {confirmAll ? (
            <span className="flex items-center gap-2">
              <Button className="min-h-10 px-3" variant="night" onClick={() => { drop(pages.map((page) => page.id)); setConfirmAll(false); }}>
                Да, все {pages.length}
              </Button>
              <Button variant="ghost" className="min-h-10 px-3" onClick={() => setConfirmAll(false)}>
                Отмена
              </Button>
            </span>
          ) : (
            <Button variant="ghost" className="min-h-10 px-3 text-rose-deep" onClick={() => setConfirmAll(true)}>
              Удалить все страницы
            </Button>
          )}
          <span className="w-full px-1 text-xs text-muted">Удалённое лежит в корзине внизу экрана — его можно вернуть.</span>
        </div>
      ) : null}
      <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        {pages.map((page, index) => {
          const dragging = drag?.id === page.id;
          const target = drag && !dragging && drag.over === index;
          return (
            <li
              key={page.id}
              data-idx={index}
              data-drag={dragging ? "1" : undefined}
              className={cn("relative", arrange && page.kind !== "cover" && "touch-none select-none", dragging && "z-30")}
              style={dragging ? { transform: `translate(${drag.dx}px, ${drag.dy}px) scale(1.06)`, pointerEvents: "none" } : undefined}
              onPointerDown={(event) => onDown(event, page, index)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <button type="button" onClick={() => (arrange ? undefined : onOpen(page.id))} className={cn("group block w-full text-left", arrange && page.kind !== "cover" && "cursor-grab")}>
                <div className={cn("thumb-shadow overflow-hidden rounded-[6px] transition", !arrange && "group-active:scale-[0.98]", arrange && page.kind !== "cover" && "animate-[wiggle_0.4s_ease-in-out_infinite_alternate]", target && "ring-4 ring-rose", dragging && "shadow-2xl", arrange && picked.includes(page.id) && "ring-4 ring-night")}>
                  <PageSheet page={page} meta={meta} editing />
                </div>
              </button>
              {arrange ? (
                <>
                  <span className={cn("pointer-events-none absolute left-2 top-2 grid size-6 place-items-center rounded-full border-2 border-white text-xs font-bold shadow", picked.includes(page.id) ? "bg-night text-paper" : "bg-white/70 text-transparent")}>✓</span>
                  <button type="button" aria-label="Удалить страницу" onClick={() => drop([page.id])} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-rose-deep shadow">
                    <Trash2 className="size-4" />
                  </button>
                </>
              ) : null}
              {arrange && page.kind !== "cover" ? (
                <div className="mt-2 flex items-center justify-between gap-1">
                  <button type="button" aria-label="Раньше" disabled={index <= first} onClick={() => move(page.id, index - 1)} className="grid size-9 place-items-center rounded-full bg-white/80 text-ink disabled:opacity-30">
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="truncate text-xs text-ink">
                    {index}. {page.title}
                  </span>
                  <button type="button" aria-label="Позже" disabled={index >= pages.length - 1} onClick={() => move(page.id, index + 1)} className="grid size-9 place-items-center rounded-full bg-white/80 text-ink disabled:opacity-30">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              ) : (
                <p className="mt-2 flex items-baseline gap-1.5 text-sm text-ink">
                  <span className="tabular-nums text-muted">{page.kind === "cover" ? "◆" : index}</span>
                  <span className="truncate font-medium">{page.kind === "cover" ? "Обложка" : page.title}</span>
                </p>
              )}
            </li>
          );
        })}
        {!arrange ? (
          <li>
            <button type="button" onClick={onAdd} className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-[6px] border-2 border-dashed border-ink/20 bg-white/30 text-ink/70 backdrop-blur">
              <Plus className="size-7" />
              <span className="text-sm font-medium">Новая страница</span>
            </button>
          </li>
        ) : null}
      </ul>
    </>
  );
}

/** Полный шаблон на 100 страниц — только для тех, у кого открыта программа. */
function FullTemplate({ pages, meta }: { pages: BookPage[]; meta: { dedicatee: string; collector: string } }) {
  const nav = useNav();
  const open = useRod((state) => state.programOpen);
  const addPage = useRod((state) => state.addPage);
  const placePage = useRod((state) => state.placePage);
  const [ask, setAsk] = useState(false);
  const added = pages.some((page) => page.promptId?.startsWith("full:"));

  const add = () => {
    if (!pages.some((page) => page.kind === "cover")) placePage(addPage(coverPage(meta)), 0);
    fullBookPages().forEach((page) => addPage(page));
    setAsk(false);
    toast(`В книгу добавлено ${FULL_BOOK_PAGES} страниц по главам`);
  };

  let start = 2;
  const chapters = FULL_BOOK.map((chapter) => {
    const count = chapter.pages.reduce((sum, page) => sum + page.kinds.length, 0);
    const range = `${start}–${start + count - 1}`;
    start += count;
    return { ...chapter, range };
  });

  return (
    <section className={cn("mb-6 rounded-[2rem] p-5", open ? "aurora" : "glass")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/60">Для участников программы</p>
          <h2 className="display-title mt-1 text-[1.7rem] leading-tight text-ink">Полный шаблон Книги рода · 100 страниц</h2>
        </div>
        {!open ? (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white/80 text-rose-deep">
            <Lock className="size-4" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-ink/70">Одна ветка рода — как историческое расследование: дома, любовь, судьбы, кухня, тайны и наследие. На каждой странице подсказка, что туда внести.</p>
      <ol className="mt-3 grid gap-1 text-sm text-ink">
        {chapters.map((chapter) => (
          <li key={chapter.n} className="flex gap-2">
            <span className="w-14 shrink-0 tabular-nums text-ink/50">{chapter.range}</span>
            <span>
              {chapter.n}. {chapter.title}
            </span>
          </li>
        ))}
      </ol>
      {open ? (
        added ? (
          <p className="mt-4 text-sm font-medium text-ink">Шаблон уже в книге — листайте и заполняйте страницы.</p>
        ) : ask ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={add}>Да, добавить {FULL_BOOK_PAGES} страниц</Button>
            <Button variant="white" onClick={() => setAsk(false)}>
              Отмена
            </Button>
          </div>
        ) : (
          <Button className="mt-4" onClick={() => setAsk(true)}>
            Добавить шаблон в мою книгу
          </Button>
        )
      ) : (
        <Button className="mt-4" onClick={() => nav.tab({ id: "lessons" })}>
          <Lock className="size-4" /> Откроется с программой «Книга рода»
        </Button>
      )}
    </section>
  );
}
