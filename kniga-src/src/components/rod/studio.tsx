import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  Camera,
  Eraser,
  Heart,
  House,
  Mic,
  Move,
  PenLine,
  RotateCw,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Trash2,
  Type,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Button, ScreenFrame, useNav } from "@/components/rod/chrome";
import { compressImage } from "@/lib/rod/image";
import { liftSubject } from "@/lib/rod/lift";
import { FONT_LABEL, PAGE_PROMPTS, findPrompt, todayTask } from "@/lib/rod/pages";
import { downloadFamilyBook } from "@/lib/rod/print-book";
import { isBookReady, overallOf, partsOf, plural } from "@/lib/rod/progress";
import { composeMemory, readHandwriting, storiesFromTalk } from "@/lib/rod/studio-ai";
import { paperSoundsOn, scratch, setPaperSounds, stickSound, turnPage } from "@/lib/rod/sounds";
import { useRod } from "@/lib/rod/store";
import type { BookPage, FontKind, InkStroke, PageBlock, PaperKind, PhotoFrame, StickerKind } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

type Tool = "pen" | "brush" | "erase" | "move";
type Sheet = "library" | "help" | "ink" | "interview" | "photos" | "chip" | null;

const STICKERS: StickerKind[] = ["heart", "star", "leaf", "home", "seal", "sun", "tape", "bubble"];
const PHOTO_FRAMES: { frame: PhotoFrame; label: string }[] = [
  { frame: "none", label: "Обычное" },
  { frame: "polaroid", label: "Полароид" },
  { frame: "tape", label: "Скотч" },
];

export function StudioScreen() {
  const nav = useNav();
  const pages = useRod((state) => state.pages);
  const addPage = useRod((state) => state.addPage);
  const updatePage = useRod((state) => state.updatePage);
  const removePage = useRod((state) => state.removePage);
  const movePage = useRod((state) => state.movePage);
  const dedicatee = useRod((state) => state.dedicatee);
  const collector = useRod((state) => state.collector);
  const people = useRod((state) => state.people);
  const photos = useRod((state) => state.photos);
  const stories = useRod((state) => state.stories);
  const places = useRod((state) => state.places);
  const documents = useRod((state) => state.documents);
  const notes = useRod((state) => state.notes);
  const events = useRod((state) => state.events);
  const audience = useRod((state) => state.audience);
  const [pageId, setPageId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [brush, setBrush] = useState<"rose" | "sage">("rose");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [flip, setFlip] = useState(false);
  const [live, setLive] = useState<number[] | null>(null);
  const [chip, setChip] = useState<"place" | "date" | "doc" | null>(null);
  const [stickersOn, setStickersOn] = useState(false);
  const [photoFrame, setPhotoFrame] = useState<PhotoFrame>("none");
  const [shelf, setShelf] = useState(false);
  const [carry, setCarry] = useState<{ src: string; caption: string; x: number; y: number } | null>(null);
  const drawRef = useRef<number[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hand = useCanHandwrite();

  const snapshot = { people, places, photos, stories, documents, notes, events, audience, dedicatee, pages };
  const parts = partsOf(snapshot);
  const overall = overallOf(parts);
  const ready = isBookReady(snapshot, overall) || pages.filter(pageHasMatter).length >= 4;
  const active = pages.find((page) => page.id === pageId) ?? pages[pages.length - 1] ?? null;
  const maiden = people.find((person) => /бабуш/i.test(person.relation) && !person.maidenName.trim());
  const unused = PAGE_PROMPTS.find((prompt) => !pages.some((page) => page.promptId === prompt.id));
  const task = todayTask({
    hasCover: pages.some((page) => page.kind === "cover"),
    hasInk: hand
      ? pages.some((page) => page.strokes.length > 0)
      : pages.some((page) => page.blocks.some((block) => block.type === "text" && block.text.trim().length > 0)),
    handwriting: hand,
    photos: photos.length + pages.reduce((sum, page) => sum + page.blocks.filter((block) => block.type === "photo").length, 0),
    people: people.length,
    maidenGap: maiden ? maiden.name || "Бабушка" : null,
    interviews: notes.length + pages.reduce((sum, page) => sum + page.blocks.filter((block) => block.type === "voice").length, 0),
    unusedPrompt: unused ? unused.title : null,
  });

  const openCover = () => {
    const id = addPage({
      title: "Обложка",
      kind: "cover",
      paper: "rose",
      strokes: [],
      blocks: hand
        ? []
        : [{ id: crypto.randomUUID(), type: "text", x: 8, y: 18, w: 84, text: "", font: "serif", size: "md" }],
    });
    setPageId(id);
    setTool(hand ? "pen" : "move");
  };

  const openPrompt = (promptId: string) => {
    const prompt = findPrompt(promptId);
    if (!prompt) return;
    const id = addPage({
      title: prompt.title,
      kind: "page",
      paper: prompt.paper,
      promptId,
      strokes: [],
      blocks: [
        { id: crypto.randomUUID(), type: "text", x: 8, y: 6, w: 70, text: prompt.title, font: "serif", size: "lg" },
        { id: crypto.randomUUID(), type: "text", x: 8, y: 22, w: 78, text: "", font: "script", size: "md" },
        { id: crypto.randomUUID(), type: "sticker", x: 72, y: 4, kind: "tape", rotate: -8 },
        { id: crypto.randomUUID(), type: "sticker", x: 8, y: 68, kind: "bubble", w: 46, text: prompt.questions[0] ?? "", rotate: -2 },
      ],
    });
    setPageId(id);
    setSheet(null);
    setTool(hand ? "pen" : "move");
  };

  const placePhoto = (src: string, frame: PhotoFrame, caption = "", at?: { x: number; y: number }) => {
    if (!active) return;
    stickSound();
    const tilt = frame === "none" ? 0 : Math.round((Math.random() * 6 - 3) * 10) / 10;
    updatePage(active.id, (page) => {
      const taken = page.blocks.filter((block) => block.type === "photo").length;
      return {
        ...page,
        blocks: [
          ...page.blocks,
          {
            id: crypto.randomUUID(),
            type: "photo",
            x: at?.x ?? clamp(8 + (taken % 2) * 6, 0, 70),
            y: at?.y ?? clamp(26 + (taken % 3) * 4, 0, 70),
            w: frame === "none" ? 54 : 46,
            h: frame === "none" ? 34 : 42,
            src,
            caption,
            frame,
            rotate: tilt,
          },
        ],
      };
    });
  };

  const liftFromShelf = (src: string, caption: string, event: React.PointerEvent) => {
    const origin = { x: event.clientX, y: event.clientY };
    setCarry({ src, caption, x: origin.x, y: origin.y });
    const move = (ev: PointerEvent) => setCarry({ src, caption, x: ev.clientX, y: ev.clientY });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setCarry(null);
      const stage = document.querySelector("[data-page-stage]");
      const moved = (ev.clientX - origin.x) ** 2 + (ev.clientY - origin.y) ** 2 > 36;
      if (!(stage instanceof HTMLElement)) {
        placePhoto(src, photoFrame, caption);
        return;
      }
      const rect = stage.getBoundingClientRect();
      const inside = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (moved && !inside) return;
      const at = inside
        ? {
            x: clamp(((ev.clientX - rect.left) / rect.width) * 100 - 20, 0, 68),
            y: clamp(((ev.clientY - rect.top) / rect.height) * 100 - 12, 0, 72),
          }
        : undefined;
      placePhoto(src, photoFrame, caption, at);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    if (!hand) setTool("move");
  }, [hand]);

  const drawTool: Tool = hand ? tool : "move";

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || drawTool === "move") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = relativePoint(event);
    if (drawTool === "erase") {
      scratch("erase");
      updatePage(active.id, (page) => ({ ...page, strokes: eraseNear(page.strokes, point) }));
      return;
    }
    scratch(drawTool === "brush" ? "brush" : "pen");
    drawRef.current = [point.x, point.y];
    setLive([point.x, point.y]);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const point = relativePoint(event);
    if (drawTool === "erase" && event.buttons) {
      scratch("erase");
      updatePage(active.id, (page) => ({ ...page, strokes: eraseNear(page.strokes, point) }));
      return;
    }
    if (!drawRef.current) return;
    scratch(drawTool === "brush" ? "brush" : "pen");
    drawRef.current = [...drawRef.current, point.x, point.y];
    setLive(drawRef.current);
  };

  const onPointerUp = () => {
    if (!active || !drawRef.current) return;
    const points = drawRef.current;
    drawRef.current = null;
    setLive(null);
    if (points.length < 4) return;
    if (active.strokes.length > 140) {
      toast("На странице уже много чернил. Сохраните часть печатным текстом.");
      return;
    }
    const stroke: InkStroke = {
      id: crypto.randomUUID(),
      color: drawTool === "brush" ? brush : "ink",
      width: drawTool === "brush" ? 7 : 2.6,
      points,
    };
    updatePage(active.id, (page) => ({ ...page, strokes: [...page.strokes, stroke] }));
  };

  return (
    <ScreenFrame>
      {pages.length === 0 || !active ? (
        <>
          <div className="mb-4">
            <p className="text-sm text-rose-deep">Собери историю семьи, пока есть кому её рассказать</p>
            <div className="flex items-end justify-between gap-3">
              <h1 className="font-display text-3xl text-ink sm:text-4xl">Книга рода {dedicatee.trim() || collector.trim() || "семьи"}</h1>
              <p className="font-display text-3xl tabular-nums text-ink">{overall}%</p>
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
              {parts.map((part) => (
                <li key={part.key}>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full bg-rose" style={{ width: `${part.value}%` }} />
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {part.label} {part.value}%
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            className="wash-sage mb-4 w-full rounded-4xl p-4 text-left"
            onClick={() => {
              if (!pages.some((page) => page.kind === "cover")) openCover();
              else if (unused) openPrompt(unused.id);
              else setTool("pen");
            }}
          >
            <p className="text-sm font-semibold text-ink">Сегодня</p>
            <p className="font-display text-2xl text-ink">{task.title}</p>
            <p className="text-sm text-muted">{task.detail}</p>
          </button>
          <Welcome hand={hand} onCover={openCover} onPrompt={openPrompt} />
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-2xl text-ink">Книга рода {dedicatee.trim() || collector.trim() || "семьи"}</p>
              <p className="truncate text-sm text-muted">{task.title}</p>
            </div>
            <p className="font-display text-3xl tabular-nums text-ink">{overall}%</p>
          </div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Button variant="soft" onClick={() => { turnPage(); setFlip(true); }}>
                Листать
              </Button>
              <SoundToggle />
              <Button variant="ghost" onClick={() => setSheet("library")}>
                Новая страница
              </Button>
              <PrintFileButton pages={pages} dedicatee={dedicatee} collector={collector} percent={overall} />
            </div>
            <button
              type="button"
              className="text-sm text-muted underline"
              onClick={() => {
                removePage(active.id);
                setPageId(null);
              }}
            >
              Убрать страницу
            </button>
          </div>

          <div className="lg:grid lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)] lg:items-start lg:gap-8">
          <div className="book-shell page-stage relative">
            <PageCanvas
              page={active}
              dedicatee={dedicatee}
              collector={collector}
              percent={overall}
              tool={drawTool}
              brush={brush}
              live={live}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            />
          </div>

          <div className="min-w-0">
          <ToolBar
            hand={hand}
            tool={drawTool}
            setTool={setTool}
            brush={brush}
            setBrush={setBrush}
            onText={() => dropText(active, updatePage)}
            onPhoto={() => fileRef.current?.click()}
            onSticker={() => setStickersOn((value) => !value)}
            onPlace={() => setChip("place")}
            onDate={() => setChip("date")}
            onVoice={() => setSheet("interview")}
            onDoc={() => setChip("doc")}
            onInk={() => setSheet("ink")}
            onHelp={() => setSheet("help")}
            onPhotos={() => setSheet("photos")}
            inkDisabled={active.strokes.length === 0}
          />
          {stickersOn ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {STICKERS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  aria-label={kind}
                  onClick={() => {
                    stickSound();
                    updatePage(active.id, (page) => ({
                      ...page,
                      blocks: [
                        ...page.blocks,
                        kind === "bubble"
                          ? { id: crypto.randomUUID(), type: "sticker", x: 10, y: 60, kind, w: 46, text: "", rotate: -2 }
                          : kind === "tape"
                            ? { id: crypto.randomUUID(), type: "sticker", x: 36, y: 16, kind, w: 28, rotate: -8 }
                            : { id: crypto.randomUUID(), type: "sticker", x: 64, y: 8, kind, w: 16 },
                      ],
                    }));
                    setStickersOn(false);
                    setTool("move");
                  }}
                >
                  <StickerGlyph kind={kind} />
                </button>
              ))}
            </div>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {PHOTO_FRAMES.map((item) => (
              <button
                key={item.frame}
                type="button"
                className={cn("min-h-11 rounded-full px-3 text-sm", photoFrame === item.frame ? "bg-night text-paper" : "glass text-ink")}
                onClick={() => setPhotoFrame(item.frame)}
              >
                {item.label}
              </button>
            ))}
            <button type="button" className={cn("min-h-11 rounded-full px-3 text-sm", shelf ? "bg-night text-paper" : "glass text-ink")} onClick={() => setShelf((value) => !value)}>
              Полка
            </button>
          </div>
          {shelf ? (
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
              {photos.length === 0 ? <p className="text-sm text-muted">В архиве пусто. Кнопка «Фото» берёт снимок с телефона и кладёт его выбранным оформлением.</p> : null}
              {photos.map((photo) => {
                const caption = [photo.who, photo.year, photo.where].filter(Boolean).join(", ");
                return (
                  <button
                    key={photo.id}
                    type="button"
                    className="shrink-0"
                    onPointerDown={(event) => liftFromShelf(photo.dataUrl, caption, event)}
                  >
                    <img src={photo.dataUrl} alt={caption || "Снимок с полки"} draggable={false} className="h-16 w-14 rounded-lg object-cover" />
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {(["cream", "lined", "rose", "sage"] as PaperKind[]).map((paper) => (
                <button
                  key={paper}
                  type="button"
                  aria-label={paper}
                  onClick={() => updatePage(active.id, (page) => ({ ...page, paper }))}
                  className={cn("size-9 rounded-full border border-line", paperClass(paper), active.paper === paper ? "ring-2 ring-rose" : "")}
                />
              ))}
            </div>
            <p className="text-sm text-muted">
              {hand
                ? drawTool === "move"
                  ? "Обычное, полароид или скотч. Угол меняет размер, кружок сверху — наклон. Зажмите фото, чтобы вырезать."
                  : "Пишите поверх снимка. Перо ещё раз — чтобы верстать"
                : "Обычное фото, полароид или скотч. Зажмите снимок — объект останется без фона."}
            </p>
          </div>

          <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
            <button type="button" className="glass shrink-0 rounded-full px-3 py-2 text-sm text-ink" onClick={() => {
              const index = pages.findIndex((page) => page.id === active.id);
              if (index <= 0) return;
              turnPage();
              movePage(active.id, -1);
            }}>
              Раньше
            </button>
            {pages.map((page, index) => (
              <button
                key={page.id}
                type="button"
                onClick={() => {
                  if (page.id !== active.id) turnPage();
                  setPageId(page.id);
                }}
                className={cn(
                  "shrink-0 rounded-full px-3 py-2 text-sm",
                  page.id === active.id ? "bg-night text-paper" : "glass text-ink",
                )}
              >
                {index + 1}. {page.title}
              </button>
            ))}
            <button type="button" className="glass shrink-0 rounded-full px-3 py-2 text-sm text-ink" onClick={() => {
              const index = pages.findIndex((page) => page.id === active.id);
              if (index < 0 || index >= pages.length - 1) return;
              turnPage();
              movePage(active.id, 1);
            }}>
              Позже
            </button>
          </div>
          </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void compressImage(file)
                .then((src) => placePhoto(src, photoFrame))
                .catch(() => toast("Этот снимок не открылся. Выберите JPG или PNG."));
            }}
          />
        </>
      )}

      {ready ? (
        <section className="wash-blush mt-5 rounded-4xl p-5">
          <h2 className="font-display text-3xl text-ink">Ты уже собрал материал для настоящей Книги рода.</h2>
          <p className="mt-2 text-sm text-muted">
            Теперь осталось научиться превратить всё это в историю, которую захочется перечитывать.
          </p>
          <Button className="mt-4" onClick={() => nav.go({ id: "lessons" })}>
            Урок «Книга рода»
          </Button>
        </section>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {plural(pages.length, "страница", "страницы", "страниц")} в книге. Курс подождёт, пока захочется собрать из этого историю.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => nav.go({ id: "surname" })}>
          Откуда фамилия
        </Button>
        <Button variant="ghost" onClick={() => nav.go({ id: "archive", tab: "people" })}>
          Люди и лента
        </Button>
      </div>

      {sheet === "library" ? (
        <Library
          onClose={() => setSheet(null)}
          onPrompt={openPrompt}
          onBlank={() => {
            const id = addPage({
              title: "Чистая страница",
              kind: "page",
              paper: "cream",
              strokes: [],
              blocks: [{ id: crypto.randomUUID(), type: "text", x: 8, y: 8, w: 84, text: "", font: "script", size: "md" }],
            });
            setPageId(id);
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === "help" && active ? (
        <HelpSheet
          title={active.title}
          questions={findPrompt(active.promptId)?.questions ?? GENERIC_QUESTIONS}
          onClose={() => setSheet(null)}
          onInsert={(text) => {
            updatePage(active.id, (page) => ({
              ...page,
              blocks: [...page.blocks, { id: crypto.randomUUID(), type: "text", x: 8, y: 36, w: 84, text, font: "serif", size: "md" }],
            }));
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === "ink" && active ? (
        <InkSheet
          page={active}
          onClose={() => setSheet(null)}
          onKeep={() => {
            setSheet(null);
            toast("Почерк остаётся на странице");
          }}
          onPlace={(text, font, hideInk) => {
            const box = strokeBox(active.strokes);
            updatePage(active.id, (page) => ({
              ...page,
              strokes: hideInk ? page.strokes.filter((stroke) => stroke.color !== "ink") : page.strokes,
              blocks: [
                ...page.blocks,
                { id: crypto.randomUUID(), type: "text", x: box.x, y: box.y, w: Math.max(box.w, 40), text, font, size: "md" },
              ],
            }));
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === "interview" ? (
        <InterviewSheet
          onClose={() => setSheet(null)}
          onPages={(drafts) => {
            drafts.forEach((draft) => {
              addPage({
                title: draft.title,
                kind: "page",
                paper: "cream",
                strokes: [],
                blocks: [
                  { id: crypto.randomUUID(), type: "text", x: 8, y: 6, w: 84, text: draft.title, font: "serif", size: "lg" },
                  { id: crypto.randomUUID(), type: "voice", x: 8, y: 22, w: 84, title: "Из разговора", transcript: draft.text },
                ],
              });
            });
            setSheet(null);
            toast(drafts.length > 1 ? "Из разговора собрались страницы" : "Страница разговора готова");
          }}
        />
      ) : null}
      {sheet === "photos" ? (
        <PhotoStorySheet
          photos={photos}
          onClose={() => setSheet(null)}
          onMake={(chosen) => {
            stickSound();
            void makePhotoSpread(chosen, addPage).then((id) => {
              setPageId(id);
              setSheet(null);
            });
          }}
        />
      ) : null}
      {chip ? (
        <ChipSheet
          kind={chip}
          onClose={() => setChip(null)}
          onSave={(text) => {
            if (!active || !text.trim()) return;
            stickSound();
            updatePage(active.id, (page) => ({
              ...page,
              blocks: [
                ...page.blocks,
                chip === "doc"
                  ? { id: crypto.randomUUID(), type: "doc", x: 8, y: 70, w: 80, title: text.trim(), note: "" }
                  : { id: crypto.randomUUID(), type: "chip", x: 8, y: 78, kind: chip, text: text.trim() },
              ],
            }));
            setChip(null);
          }}
        />
      ) : null}
      {carry ? (
        <img src={carry.src} alt="" className="pointer-events-none fixed z-50 h-24 w-20 rounded-md object-cover shadow-lg" style={{ left: carry.x - 40, top: carry.y - 48 }} />
      ) : null}
      {flip ? <FlipBook pages={pages} dedicatee={dedicatee} collector={collector} percent={overall} onClose={() => setFlip(false)} onPrompt={openPrompt} /> : null}
    </ScreenFrame>
  );
}

function Welcome({ hand, onCover, onPrompt }: { hand: boolean; onCover: () => void; onPrompt: (id: string) => void }) {
  return (
    <div>
      <button type="button" onClick={onCover} className="book-shell paper-rose mx-auto grid aspect-[3/4] w-full max-w-sm place-items-end rounded-2xl p-6 text-left">
        <span>
          <span className="block font-script text-2xl text-rose-deep">открыть первую страницу</span>
          <span className="mt-1 block font-display text-4xl text-ink">Обложка</span>
          <span className="mt-2 block text-sm text-muted">
            {hand
              ? "Дальше можно писать стилусом, ставить фото и двигать всё по листу."
              : "На телефоне — текст, фото и голос. Почерк откроется на планшете и компьютере."}
          </span>
        </span>
      </button>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {PAGE_PROMPTS.slice(0, 4).map((prompt) => (
          <button key={prompt.id} type="button" onClick={() => onPrompt(prompt.id)} className="glass rounded-3xl p-4 text-left">
            <span className="block font-display text-2xl text-ink">{prompt.title}</span>
            <span className="block text-sm text-muted">{prompt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PageCanvas({
  page,
  dedicatee,
  collector,
  percent,
  tool,
  brush,
  live,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  quiet = false,
}: {
  page: BookPage;
  dedicatee: string;
  collector: string;
  percent: number;
  tool: Tool;
  brush: "rose" | "sage";
  live: number[] | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  quiet?: boolean;
}) {
  const updatePage = useRod((state) => state.updatePage);
  const drawing = tool !== "move" && !quiet;
  return (
    <article data-page-stage={quiet ? undefined : "live"} className={cn("relative aspect-[3/4] overflow-hidden rounded-2xl", paperClass(page.paper))}>
      {page.kind === "cover" ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-6">
          <p className="font-script text-3xl text-rose-deep">{dedicatee.trim() ? `для ${dedicatee.trim()}` : "для тех, кто откроет позже"}</p>
          <h2 className="font-display text-5xl text-ink">Книга рода</h2>
          <p className="mt-2 text-sm text-ink">{collector.trim() || "семейный архив, который можно продолжать"}</p>
          <p className="mt-4 text-sm text-muted">Собрано на {percent}%. Это не дерево. Это живая книга.</p>
        </div>
      ) : null}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-20 h-full w-full">
        {page.strokes.map((stroke) => (
          <polyline
            key={stroke.id}
            fill="none"
            stroke={strokeColor(stroke.color)}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={toPoints(stroke.points)}
          />
        ))}
        {live ? (
          <polyline
            fill="none"
            stroke={strokeColor(tool === "brush" ? brush : "ink")}
            strokeWidth={tool === "brush" ? 7 : 2.6}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            points={toPoints(live)}
          />
        ) : null}
      </svg>
      {page.blocks.map((block) => (
        <BlockView key={block.id} block={block} pageId={page.id} updatePage={updatePage} quiet={quiet} />
      ))}
      {drawing ? (
        <div
          className="ink-surface absolute inset-0 z-40 cursor-crosshair"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      ) : null}
    </article>
  );
}

function PhotoLay({
  block,
  patch,
  quiet,
}: {
  block: Extract<PageBlock, { type: "photo" }>;
  patch: (partial: object) => void;
  quiet: boolean;
}) {
  const [phase, setPhase] = useState<"idle" | "hold" | "work" | "pop">("idle");
  const [label, setLabel] = useState("Вырезаю объект…");
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const working = useRef(false);
  const lifted = block.frame === "sticker" && Boolean(block.cut);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const finishPop = () => {
    setPhase("pop");
    window.setTimeout(() => setPhase((current) => (current === "pop" ? "idle" : current)), 460);
  };

  const run = async () => {
    if (working.current) return;
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (block.cut) {
      patch({ frame: "sticker" });
      stickSound();
      finishPop();
      return;
    }
    working.current = true;
    setPhase("work");
    setLabel("Ищу объект…");
    try {
      const cut = await liftSubject(block.src, setLabel);
      if (!cut) {
        toast("Не получилось отделить объект. Зажмите ещё раз или возьмите снимок, где он отделён от фона.");
        setPhase("idle");
        return;
      }
      patch({ cut, frame: "sticker" });
      stickSound();
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(12);
      finishPop();
    } catch {
      toast("Вырезка не открылась. Проверьте сеть и зажмите снимок ещё раз.");
      setPhase("idle");
    } finally {
      working.current = false;
    }
  };

  const cancelHold = () => {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
    setPhase("idle");
  };

  const onDown = (event: React.PointerEvent) => {
    if (phase === "work" || lifted) return;
    event.stopPropagation();
    start.current = { x: event.clientX, y: event.clientY };
    setPhase("hold");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void run();
    }, 480);
  };

  const onMove = (event: React.PointerEvent) => {
    if (timer.current === null || !start.current) return;
    const dx = event.clientX - start.current.x;
    const dy = event.clientY - start.current.y;
    if (dx * dx + dy * dy > 144) cancelHold();
  };

  const polaroid = !lifted && block.frame === "polaroid";
  const plain = !lifted && block.frame === "none";
  const taped = !lifted && block.frame === "tape";

  return (
    <figure className={cn(polaroid && "bg-paper p-2 pb-8 shadow-md", plain && "shadow-md", taped && "relative")}>
      {taped ? <span className="absolute left-1/2 top-0 z-10 h-4 w-14 -translate-x-1/2 -translate-y-1/2 -rotate-3 rounded-sm bg-blush shadow" /> : null}
      <div
        className="subject-shot relative"
        onPointerDown={quiet ? undefined : onDown}
        onPointerMove={quiet ? undefined : onMove}
        onPointerUp={quiet ? undefined : cancelHold}
        onPointerCancel={quiet ? undefined : cancelHold}
        onContextMenu={(event) => event.preventDefault()}
      >
        <img
          src={lifted && block.cut ? block.cut : block.src}
          alt={block.caption || "Семейная фотография"}
          draggable={false}
          className={cn(
            "w-full",
            lifted ? "sticker-lay w-full object-contain" : "aspect-[4/3] object-cover",
            (plain || taped) && "rounded-md",
            (phase === "hold" || phase === "work") && "subject-hold",
            phase === "pop" && "subject-pop",
          )}
        />
        {phase === "hold" ? (
          <span className="pointer-events-none absolute inset-x-2 top-2 rounded-full bg-paper px-2 py-1 text-center text-xs font-medium text-ink">
            Не отпускайте
          </span>
        ) : null}
        {phase === "work" ? (
          <span className="pointer-events-none absolute inset-x-2 bottom-2 rounded-full bg-night px-2 py-1 text-center text-xs text-paper">
            {label}
          </span>
        ) : null}
        {lifted && !quiet ? (
          <button type="button" className="absolute bottom-1 left-1 min-h-11 rounded-full bg-paper px-3 text-xs text-rose-deep" onClick={() => patch({ frame: "none" })}>
            Вернуть фон
          </button>
        ) : null}
      </div>
      {quiet ? (
        block.caption.trim() ? <p className="mt-1 text-sm text-ink">{block.caption}</p> : null
      ) : (
        <input
          value={block.caption}
          placeholder="Кто, где, какой год"
          onChange={(event) => patch({ caption: event.target.value })}
          className="mt-1 w-full bg-transparent text-sm text-ink outline-none"
        />
      )}
      {quiet || lifted ? null : (
        <div className="mt-1 flex flex-wrap gap-1">
          {PHOTO_FRAMES.map((item) => (
            <button
              key={item.frame}
              type="button"
              className={cn("min-h-11 rounded-full px-3 text-sm", block.frame === item.frame ? "bg-night text-paper" : "text-rose-deep")}
              onClick={() => patch({ frame: item.frame })}
            >
              {item.label}
            </button>
          ))}
          <button type="button" className="min-h-11 px-2 text-sm text-rose-deep" disabled={phase === "work"} onClick={() => void run()}>
            Вырезать
          </button>
        </div>
      )}
    </figure>
  );
}

function BlockView({
  block,
  pageId,
  updatePage,
  quiet,
}: {
  block: PageBlock;
  pageId: string;
  updatePage: (id: string, updater: (page: BookPage) => BookPage) => void;
  quiet: boolean;
}) {
  const [ghost, setGhost] = useState<Box | null>(null);
  const mode = useRef<"move" | "size" | "turn" | null>(null);
  const origin = useRef<Box & { px: number; py: number; angle: number }>({ ...blockBox(block), px: 0, py: 0, angle: 0 });
  const view = ghost ?? blockBox(block);

  const begin = (event: React.PointerEvent, next: "move" | "size" | "turn") => {
    event.stopPropagation();
    const parent = (event.currentTarget as HTMLElement).closest("article");
    if (!parent) return;
    const point = relativePoint(event, parent);
    const box = blockBox(block);
    origin.current = {
      ...box,
      px: point.x,
      py: point.y,
      angle: Math.atan2(point.y - (box.y + box.h / 2), point.x - (box.x + box.w / 2)),
    };
    mode.current = next;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };
  const drag = (event: React.PointerEvent) => {
    if (!mode.current || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const parent = (event.currentTarget as HTMLElement).closest("article");
    if (!parent) return;
    const point = relativePoint(event, parent);
    const from = origin.current;
    if (mode.current === "move") {
      setGhost({ ...from, x: clamp(from.x + point.x - from.px, 0, 82), y: clamp(from.y + point.y - from.py, 0, 88) });
      return;
    }
    if (mode.current === "size") {
      setGhost({
        ...from,
        w: clamp(from.w + point.x - from.px, 14, 92),
        h: clamp(from.h + point.y - from.py, 8, 78),
      });
      return;
    }
    const angle = Math.atan2(point.y - (from.y + from.h / 2), point.x - (from.x + from.w / 2));
    let deg = from.rotate + ((angle - from.angle) * 180) / Math.PI;
    deg = Math.round(deg);
    if (Math.abs(deg) < 3) deg = 0;
    setGhost({ ...from, rotate: deg });
  };
  const finish = () => {
    const next = ghost;
    mode.current = null;
    setGhost(null);
    if (!next) return;
    updatePage(pageId, (page) => ({
      ...page,
      blocks: page.blocks.map((item) => {
        if (item.id !== block.id) return item;
        if (item.type === "photo") return { ...item, x: next.x, y: next.y, w: next.w, h: next.h, rotate: next.rotate };
        if (item.type === "text" || item.type === "voice" || item.type === "doc") return { ...item, x: next.x, y: next.y, w: next.w, rotate: next.rotate };
        if (item.type === "sticker") return { ...item, x: next.x, y: next.y, w: next.w, rotate: next.rotate };
        return { ...item, x: next.x, y: next.y, rotate: next.rotate };
      }),
    }));
  };
  const patch = (partial: object) => {
    updatePage(pageId, (page) => ({
      ...page,
      blocks: page.blocks.map((item) => (item.id === block.id ? ({ ...item, ...partial } as PageBlock) : item)),
    }));
  };
  const remove = () => {
    updatePage(pageId, (page) => ({ ...page, blocks: page.blocks.filter((item) => item.id !== block.id) }));
  };
  const grab = (event: React.PointerEvent) => {
    if (quiet) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, input, textarea")) return;
    begin(event, "move");
  };

  return (
    <div
      className="absolute z-10"
      style={{ left: `${view.x}%`, top: `${view.y}%`, width: block.type === "chip" ? "auto" : `${view.w}%`, transform: `rotate(${view.rotate}deg)` }}
      onPointerDown={grab}
      onPointerMove={drag}
      onPointerUp={finish}
    >
      <div className="group relative">
        {quiet ? null : (
          <>
            <button type="button" aria-label="Двигать" className="absolute -left-3 -top-3 z-10 grid size-8 place-items-center rounded-full bg-night text-paper" onPointerDown={(event) => begin(event, "move")} onPointerMove={drag} onPointerUp={finish}>
              <Move className="size-3.5" />
            </button>
            <button type="button" aria-label="Повернуть" className="absolute -top-3 left-1/2 z-10 grid size-8 -translate-x-1/2 place-items-center rounded-full bg-paper text-ink shadow" onPointerDown={(event) => begin(event, "turn")} onPointerMove={drag} onPointerUp={finish}>
              <RotateCw className="size-3.5" />
            </button>
            <button type="button" aria-label="Размер" className="absolute -bottom-3 -right-3 z-10 size-8 rounded-full border border-line bg-paper shadow" onPointerDown={(event) => begin(event, "size")} onPointerMove={drag} onPointerUp={finish} />
            <button type="button" aria-label="Удалить" className="absolute -right-3 -top-3 z-10 grid size-8 place-items-center rounded-full bg-paper text-ink shadow" onClick={remove}>
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
        {block.type === "text" ? (
          quiet ? (
            <p className={cn("whitespace-pre-wrap text-ink", fontClass(block.font), sizeClass(block.size, block.font))}>{block.text}</p>
          ) : (
            <>
              <textarea
                value={block.text}
                placeholder="Строка для этой страницы"
                onChange={(event) => patch({ text: event.target.value })}
                className={cn("w-full resize-none bg-transparent text-ink outline-none", fontClass(block.font), sizeClass(block.size, block.font))}
                rows={block.size === "lg" ? 2 : 4}
              />
              <button
                type="button"
                className="text-xs text-rose-deep"
                onClick={() => {
                  const order: FontKind[] = ["script", "serif", "sans"];
                  const next = order[(order.indexOf(block.font) + 1) % order.length] ?? "serif";
                  patch({ font: next });
                }}
              >
                {FONT_LABEL[block.font]}
              </button>
            </>
          )
        ) : null}
        {block.type === "photo" ? <PhotoLay block={block} patch={patch} quiet={quiet} /> : null}
        {block.type === "sticker" && block.kind === "bubble" && !quiet ? (
          <input
            value={block.text ?? ""}
            placeholder="Фраза"
            onChange={(event) => patch({ text: event.target.value })}
            className="w-full rounded-3xl bg-night px-3 py-2 text-sm text-paper outline-none"
          />
        ) : null}
        {block.type === "sticker" && (block.kind !== "bubble" || quiet) ? <StickerGlyph kind={block.kind} text={block.text} fit /> : null}
        {block.type === "chip" ? (
          <p className="rounded-full bg-night px-3 py-1 text-sm text-paper">
            {block.kind === "date" ? "Дата" : "Место"} · {block.text}
          </p>
        ) : null}
        {block.type === "voice" ? (
          <div className="rounded-2xl bg-paper/80 p-3">
            <p className="text-sm text-rose-deep">{block.title}</p>
            {quiet ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{block.transcript}</p> : <textarea value={block.transcript} onChange={(event) => patch({ transcript: event.target.value })} className="mt-1 min-h-20 w-full resize-none bg-transparent text-sm text-ink outline-none" />}
          </div>
        ) : null}
        {block.type === "doc" ? (
          <div className="rounded-2xl border border-dashed border-line bg-paper/70 p-3">
            {quiet ? (
              <>
                <p className="font-medium text-ink">{block.title}</p>
                <p className="text-sm text-muted">{block.note}</p>
              </>
            ) : (
              <>
                <input value={block.title} onChange={(event) => patch({ title: event.target.value })} className="w-full bg-transparent font-medium text-ink outline-none" />
                <input value={block.note} placeholder="Где лежит" onChange={(event) => patch({ note: event.target.value })} className="mt-1 w-full bg-transparent text-sm text-muted outline-none" />
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StickerGlyph({ kind, text, fit = false }: { kind: StickerKind; text?: string; fit?: boolean }) {
  if (kind === "tape") return <span className={cn("block h-5 rounded-sm bg-blush shadow", fit ? "w-full" : "w-16 -rotate-2")} />;
  if (kind === "bubble") {
    return <span className={cn("block rounded-3xl bg-night px-3 py-2 text-sm text-paper", fit ? "w-full" : "w-28")}>{text?.trim() || "…"}</span>;
  }
  const icons = { heart: Heart, star: Star, leaf: Sprout, home: House, seal: Bookmark, sun: Sun };
  const Icon = icons[kind];
  return (
    <span className={cn("grid place-items-center rounded-full bg-blush text-rose-deep shadow", fit ? "aspect-square w-full" : "size-14")}>
      <Icon className="size-6" />
    </span>
  );
}

function ToolBar(props: {
  hand: boolean;
  tool: Tool;
  setTool: (tool: Tool) => void;
  brush: "rose" | "sage";
  setBrush: (color: "rose" | "sage") => void;
  onText: () => void;
  onPhoto: () => void;
  onSticker: () => void;
  onPlace: () => void;
  onDate: () => void;
  onVoice: () => void;
  onDoc: () => void;
  onInk: () => void;
  onHelp: () => void;
  onPhotos: () => void;
  inkDisabled: boolean;
}) {
  const item = "inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium";
  return (
    <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto lg:mt-0 lg:flex-wrap lg:overflow-visible">
      {props.hand ? (
        <>
          <button type="button" className={cn(item, props.tool === "pen" ? "bg-night text-paper" : "glass text-ink")} onClick={() => props.setTool(props.tool === "pen" ? "move" : "pen")}>
            <PenLine className="mr-1 inline size-4" /> Перо
          </button>
          <button
            type="button"
            className={cn(item, props.tool === "brush" ? "bg-night text-paper" : "glass text-ink")}
            onClick={() => {
              if (props.tool === "brush") props.setBrush(props.brush === "rose" ? "sage" : "rose");
              props.setTool("brush");
            }}
          >
            Кисть
          </button>
          <button type="button" className={cn(item, props.tool === "erase" ? "bg-night text-paper" : "glass text-ink")} onClick={() => props.setTool(props.tool === "erase" ? "move" : "erase")}>
            <Eraser className="mr-1 inline size-4" /> Ластик
          </button>
        </>
      ) : null}
      <button type="button" className={cn(item, "glass text-ink")} onClick={() => { props.setTool("move"); props.onText(); }}>
        <Type className="mr-1 inline size-4" /> Строка
      </button>
      <button type="button" className={cn(item, "glass text-ink")} onClick={props.onPhoto}>
        <Camera className="mr-1 inline size-4" /> Фото
      </button>
      <button type="button" className={cn(item, "glass text-ink")} onClick={props.onSticker}>
        Стикер
      </button>
      <button type="button" className={cn(item, "glass text-ink")} onClick={props.onPlace}>Место</button>
      <button type="button" className={cn(item, "glass text-ink")} onClick={props.onDate}>Дата</button>
      <button type="button" className={cn(item, "glass text-ink")} onClick={props.onVoice}>
        <Mic className="mr-1 inline size-4" /> Интервью
      </button>
      <button type="button" className={cn(item, "glass text-ink")} onClick={props.onDoc}>Документ</button>
      <button type="button" className={cn(item, "glass text-ink")} onClick={props.onPhotos}>Из фотографий</button>
      {props.hand ? (
        <button type="button" disabled={props.inkDisabled} className={cn(item, "bg-rose text-paper disabled:opacity-40")} onClick={props.onInk}>
          В шрифт
        </button>
      ) : null}
      <button type="button" className={cn(item, "wash-blush text-ink")} onClick={props.onHelp}>
        <Sparkles className="mr-1 inline size-4" /> Помочь заполнить
      </button>
    </div>
  );
}

const GENERIC_QUESTIONS = [
  "О ком или о чём эта страница?",
  "Где и когда это было?",
  "Какая деталь до сих пор перед глазами?",
  "Какую фразу стоит сохранить дословно?",
  "Что должен узнать тот, кто откроет книгу позже?",
];

function HelpSheet({
  title,
  questions,
  onClose,
  onInsert,
}: {
  title: string;
  questions: string[];
  onClose: () => void;
  onInsert: (text: string) => void;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState<number | null>(null);

  const dictate = (index: number) => {
    const rec = recognition();
    if (!rec) {
      toast("Диктовка в этом браузере не открылась. Ответ можно вписать.");
      return;
    }
    rec.lang = "ru-RU";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => {
      const said = event.results[0]?.[0]?.transcript ?? "";
      setAnswers((current) => current.map((item, i) => (i === index ? `${item} ${said}`.trim() : item)));
      setHeard(null);
    };
    rec.onerror = () => setHeard(null);
    rec.onend = () => setHeard(null);
    setHeard(index);
    rec.start();
  };

  return (
    <SheetFrame title="Помочь заполнить" onClose={onClose}>
      <p className="text-sm text-muted">Ответьте как помните. Из слов соберётся абзац, его можно поправить на странице.</p>
      <div className="mt-3 grid gap-3">
        {questions.map((question, index) => (
          <label key={question} className="block">
            <span className="mb-1 flex items-center justify-between gap-2 text-sm font-medium text-ink">
              {question}
              <button type="button" className="text-rose-deep" onClick={() => dictate(index)}>
                {heard === index ? "Слушаю…" : "Голосом"}
              </button>
            </span>
            <textarea className="field min-h-16" value={answers[index] ?? ""} onChange={(event) => setAnswers((current) => current.map((item, i) => (i === index ? event.target.value : item)))} />
          </label>
        ))}
      </div>
      <Button
        className="mt-4"
        disabled={busy}
        onClick={() => {
          const notes = questions
            .map((question, index) => (answers[index]?.trim() ? `${question}\n${answers[index].trim()}` : ""))
            .filter(Boolean)
            .join("\n\n");
          if (!notes) return;
          setBusy(true);
          void composeMemory({ data: { title, notes } })
            .then((result) => {
              if (result.ok) onInsert(result.text);
              else {
                toast(result.error);
                onInsert(answers.filter((item) => item.trim()).join("\n\n"));
              }
            })
            .catch(() => {
              toast("Не собралось само. На страницу легли ваши слова.");
              onInsert(answers.filter((item) => item.trim()).join("\n\n"));
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Собираем…" : "Поставить на страницу"}
      </Button>
    </SheetFrame>
  );
}

function InkSheet({
  page,
  onClose,
  onKeep,
  onPlace,
}: {
  page: BookPage;
  onClose: () => void;
  onKeep: () => void;
  onPlace: (text: string, font: FontKind, hideInk: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [font, setFont] = useState<FontKind>("script");
  const [hideInk, setHideInk] = useState(false);
  const [busy, setBusy] = useState(false);

  const recognize = () => {
    setBusy(true);
    const image = rasterInk(page.strokes);
    void readHandwriting({ data: { image } })
      .then((result) => {
        if (result.ok && result.text.trim()) setText(result.text.trim());
        else toast(result.ok ? "Почерк не разобрался. Впишите строку — она встанет выбранным шрифтом." : result.error);
      })
      .catch(() => toast("Не удалось прочитать почерк. Строку можно вписать самим."))
      .finally(() => setBusy(false));
  };

  return (
    <SheetFrame title="Почерк или шрифт" onClose={onClose}>
      <p className="text-sm text-muted">Можно оставить руку как есть. Или поставить ту же строку книжным, спокойным или рукописным шрифтом — туда, где вы писали.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={recognize} disabled={busy}>
          {busy ? "Читаем…" : "Прочитать почерк"}
        </Button>
        <Button variant="soft" onClick={onKeep}>
          Оставить моим почерком
        </Button>
      </div>
      <textarea className="field mt-3 min-h-24" value={text} onChange={(event) => setText(event.target.value)} placeholder="Здесь появится распознанный текст" />
      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(FONT_LABEL) as FontKind[]).map((item) => (
          <button key={item} type="button" onClick={() => setFont(item)} className={cn("rounded-full px-3 py-2 text-sm", font === item ? "bg-night text-paper" : "glass")}>
            {FONT_LABEL[item]}
          </button>
        ))}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={hideInk} onChange={(event) => setHideInk(event.target.checked)} />
        Убрать чернила, оставить шрифт
      </label>
      <Button className="mt-4" disabled={!text.trim()} onClick={() => onPlace(text.trim(), font, hideInk)}>
        Поставить на строку
      </Button>
    </SheetFrame>
  );
}

function InterviewSheet({ onClose, onPages }: { onClose: () => void; onPages: (pages: { title: string; text: string }[]) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);

  const toggle = () => {
    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = recognition();
    if (!rec) {
      toast("Запись речи здесь недоступна. Впишите, что рассказали.");
      return;
    }
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let said = "";
      for (let i = 0; i < event.results.length; i += 1) said += event.results[i]?.[0]?.transcript ?? "";
      setText(said);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <SheetFrame title="Интервью" onClose={onClose}>
      <p className="text-sm text-muted">Мама или бабушка говорит. Потом из разговора собираются черновики страниц — вы их правите сами.</p>
      <Button className="mt-3" variant={listening ? "night" : "primary"} onClick={toggle}>
        {listening ? "Остановить" : "Слушать разговор"}
      </Button>
      <textarea className="field mt-3 min-h-36" value={text} onChange={(event) => setText(event.target.value)} placeholder="Расшифровка появится здесь" />
      <Button
        className="mt-3"
        disabled={busy || text.trim().length < 20}
        onClick={() => {
          setBusy(true);
          void storiesFromTalk({ data: { transcript: text } })
            .then((result) => {
              if (!result.ok) {
                toast(result.error);
                return;
              }
              onPages(result.pages);
            })
            .catch(() => toast("Не получилось разобрать разговор."))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Ищем истории…" : "Собрать страницы"}
      </Button>
    </SheetFrame>
  );
}

function PhotoStorySheet({
  photos,
  onClose,
  onMake,
}: {
  photos: { id: string; dataUrl: string; who: string; year: string; where: string; what: string }[];
  onClose: () => void;
  onMake: (photos: { src: string; caption: string; year: string }[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [upload, setUpload] = useState<{ src: string; caption: string; year: string }[]>([]);
  return (
    <SheetFrame title="Собрать историю из фотографий" onClose={onClose}>
      <p className="text-sm text-muted">Выберите снимки одного времени. Получится разворот, который можно подвинуть и подписать.</p>
      {photos.length === 0 ? <p className="mt-3 text-sm text-muted">В архиве пока пусто. Добавьте фото с телефона.</p> : null}
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {photos.map((photo) => {
          const on = picked.includes(photo.id);
          return (
            <li key={photo.id}>
              <button type="button" className={cn("overflow-hidden rounded-2xl", on ? "ring-2 ring-rose" : "")} onClick={() => setPicked((current) => (on ? current.filter((id) => id !== photo.id) : [...current, photo.id].slice(0, 6)))}>
                <img src={photo.dataUrl} alt={photo.who || "Фото"} className="aspect-square w-full object-cover" />
              </button>
            </li>
          );
        })}
      </ul>
      <label className="mt-3 block text-sm font-medium text-ink">
        Добавить снимки
        <input
          type="file"
          accept="image/*"
          multiple
          className="mt-1 block w-full text-sm"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])].slice(0, 4);
            void Promise.all(files.map((file) => compressImage(file).then((src) => ({ src, caption: file.name.replace(/\.[^.]+$/, ""), year: "" })))).then((items) => setUpload(items));
          }}
        />
      </label>
      <Button
        className="mt-4"
        disabled={picked.length + upload.length === 0}
        onClick={() => {
          const chosen = [
            ...photos
              .filter((photo) => picked.includes(photo.id))
              .map((photo) => ({ src: photo.dataUrl, caption: [photo.who, photo.where, photo.what].filter(Boolean).join(". "), year: photo.year })),
            ...upload,
          ].slice(0, 6);
          onMake(chosen);
        }}
      >
        Сделать разворот
      </Button>
    </SheetFrame>
  );
}

function Library({ onClose, onPrompt, onBlank }: { onClose: () => void; onPrompt: (id: string) => void; onBlank: () => void }) {
  return (
    <SheetFrame title="Страницы, которые хочется заполнить" onClose={onClose}>
      <button type="button" className="glass mb-3 w-full rounded-3xl px-4 py-3 text-left" onClick={onBlank}>
        Чистый лист
      </button>
      <ul className="grid gap-2">
        {PAGE_PROMPTS.map((prompt) => (
          <li key={prompt.id}>
            <button type="button" className="w-full rounded-3xl px-1 py-2 text-left" onClick={() => onPrompt(prompt.id)}>
              <span className="block font-medium text-ink">{prompt.title}</span>
              <span className="block text-sm text-muted">{prompt.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    </SheetFrame>
  );
}

function ChipSheet({ kind, onClose, onSave }: { kind: "place" | "date" | "doc"; onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  const label = kind === "date" ? "Дата или год" : kind === "place" ? "Место" : "Документ";
  return (
    <SheetFrame title={label} onClose={onClose}>
      <input className="field" value={text} onChange={(event) => setText(event.target.value)} placeholder={kind === "doc" ? "Свидетельство, письмо, конверт" : "Как это называют дома"} />
      <Button className="mt-3" disabled={!text.trim()} onClick={() => onSave(text)}>
        Поставить на страницу
      </Button>
    </SheetFrame>
  );
}

function FlipBook({
  pages,
  dedicatee,
  collector,
  percent,
  onClose,
  onPrompt,
}: {
  pages: BookPage[];
  dedicatee: string;
  collector: string;
  percent: number;
  onClose: () => void;
  onPrompt: (id: string) => void;
}) {
  const movePage = useRod((state) => state.movePage);
  const [index, setIndex] = useState(0);
  const safe = Math.min(index, Math.max(pages.length - 1, 0));
  const page = pages[safe];
  const missing = PAGE_PROMPTS.filter((prompt) => !pages.some((item) => item.promptId === prompt.id));
  if (!page) return null;
  const go = (next: number) => {
    if (next === safe) return;
    turnPage();
    setIndex(next);
  };
  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-ivory/95 p-4">
      <div className="mx-auto max-w-xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <button type="button" className="text-sm text-ink" onClick={onClose}>
            Закрыть книгу
          </button>
          <SoundToggle />
          <PrintFileButton pages={pages} dedicatee={dedicatee} collector={collector} percent={percent} />
        </div>
        <div key={page.id} className="book-shell page-flip">
          <PageCanvas page={page} dedicatee={dedicatee} collector={collector} percent={percent} tool="move" brush="rose" live={null} quiet onPointerDown={() => undefined} onPointerMove={() => undefined} onPointerUp={() => undefined} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button variant="soft" disabled={safe === 0} onClick={() => go(safe - 1)}>
            Назад
          </Button>
          <p className="text-sm tabular-nums text-muted">
            {safe + 1} / {pages.length}
          </p>
          <Button variant="soft" disabled={safe >= pages.length - 1} onClick={() => go(safe + 1)}>
            Дальше
          </Button>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          <Button variant="ghost" disabled={safe === 0} onClick={() => { movePage(page.id, -1); go(safe - 1); }}>
            Раньше в книге
          </Button>
          <Button variant="ghost" disabled={safe >= pages.length - 1} onClick={() => { movePage(page.id, 1); go(safe + 1); }}>
            Позже в книге
          </Button>
        </div>
        <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
          {pages.map((item, itemIndex) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(itemIndex)}
              className={cn("w-20 shrink-0 rounded-xl p-2 text-left", paperClass(item.paper), itemIndex === safe ? "ring-2 ring-rose" : "")}
            >
              <span className="block text-xs tabular-nums text-muted">{itemIndex + 1}</span>
              <span className="block truncate text-xs font-medium text-ink">{item.title}</span>
            </button>
          ))}
        </div>
        {missing.length > 0 ? (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">Эти страницы ещё не открыты</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {missing.map((prompt) => (
                <button key={prompt.id} type="button" className="glass rounded-full px-3 py-2 text-sm text-ink" onClick={() => { onPrompt(prompt.id); setIndex(pages.length); }}>
                  {prompt.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <p className="mt-4 text-center text-sm text-muted">Книга рода {dedicatee.trim() || "семьи"} может продолжиться через годы. Следующую страницу допишет уже другой.</p>
      </div>
    </div>
  );
}

function PrintFileButton({
  pages,
  dedicatee,
  collector,
  percent,
}: {
  pages: BookPage[];
  dedicatee: string;
  collector: string;
  percent: number;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy || pages.length === 0}
      className="glass inline-flex min-h-11 items-center rounded-full px-3 text-sm text-ink disabled:opacity-50"
      onClick={() => {
        setBusy(true);
        void downloadFamilyBook(pages, { dedicatee, collector, percent })
          .then(() => toast("Файл «Книга рода.pdf» сохранён"))
          .catch(() => toast("Файл не собрался. Попробуйте ещё раз."))
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Собираю…" : "Файл для печати"}
    </button>
  );
}

function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-end bg-ink/40 p-3 sm:place-items-center" role="dialog" aria-modal="true">
      <div className="glass max-h-[88vh] w-full max-w-lg overflow-auto rounded-4xl p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="font-display text-3xl text-ink">{title}</h2>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function dropText(page: BookPage, updatePage: (id: string, updater: (page: BookPage) => BookPage) => void) {
  stickSound();
  updatePage(page.id, (current) => ({
    ...current,
    blocks: [...current.blocks, { id: crypto.randomUUID(), type: "text", x: 8, y: 40, w: 84, text: "", font: "script", size: "md" }],
  }));
}

async function makePhotoSpread(
  chosen: { src: string; caption: string; year: string }[],
  addPage: (input: Omit<BookPage, "id">) => string,
) {
  const years = chosen.map((item) => item.year.match(/\d{4}/)?.[0]).filter((item): item is string => Boolean(item));
  const decades = [...new Set(years.map((year) => `${Math.floor(Number(year) / 10) * 10}`))];
  const title = decades.length === 1 ? `Семья в ${decades[0]}-е` : "История из фотографий";
  const notes = chosen.map((item, index) => `${index + 1}. ${item.year} ${item.caption}`.trim()).join("\n");
  let intro = "Эти снимки легли рядом. Подпишите, что помните, даже если год примерный.";
  if (notes.replace(/\d+\./g, "").trim().length > 12) {
    const result = await composeMemory({ data: { title, notes } }).catch(() => null);
    if (result?.ok) intro = result.text;
  }
  const blocks: PageBlock[] = [
    { id: crypto.randomUUID(), type: "text", x: 6, y: 4, w: 88, text: title, font: "serif", size: "lg" },
    { id: crypto.randomUUID(), type: "text", x: 6, y: 16, w: 88, text: intro, font: "serif", size: "sm" },
  ];
  chosen.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    blocks.push({
      id: crypto.randomUUID(),
      type: "photo",
      x: 6 + column * 46,
      y: 40 + row * 28,
      w: 42,
      h: 24,
      src: item.src,
      caption: item.caption,
      frame: "polaroid",
    });
  });
  return addPage({ title, kind: "page", paper: "cream", strokes: [], blocks });
}

function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(paperSoundsOn()), []);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Выключить звуки бумаги" : "Включить звуки бумаги"}
      className="glass inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-ink"
      onClick={() => {
        const next = !paperSoundsOn();
        setPaperSounds(next);
        setOn(next);
        if (next) turnPage();
      }}
    >
      {on ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      {on ? "Звук" : "Тихо"}
    </button>
  );
}

function paperClass(paper: PaperKind) {
  if (paper === "lined") return "paper-lined";
  if (paper === "rose") return "paper-rose";
  if (paper === "sage") return "paper-sage";
  return "paper-cream";
}

function strokeColor(color: InkStroke["color"]) {
  if (color === "rose") return "var(--color-rose)";
  if (color === "sage") return "var(--color-sage)";
  return "var(--color-ink)";
}

function useCanHandwrite() {
  const [on, setOn] = useState(() => canHandwriteNow());
  useEffect(() => {
    const media = window.matchMedia("(min-width: 640px) and (min-height: 640px)");
    const apply = () => setOn(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return on;
}

function canHandwriteNow() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 640px) and (min-height: 640px)").matches;
}

function paintColor(color: InkStroke["color"]) {
  const name = color === "rose" ? "--color-rose" : color === "sage" ? "--color-sage" : "--color-ink";
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || "var(--color-ink)";
}

function toPoints(points: number[]) {
  const pairs: string[] = [];
  for (let i = 0; i < points.length; i += 2) pairs.push(`${points[i]},${points[i + 1]}`);
  return pairs.join(" ");
}

function relativePoint(event: React.PointerEvent, element?: Element) {
  const rect = (element ?? event.currentTarget).getBoundingClientRect();
  return {
    x: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
    y: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10,
  };
}

function eraseNear(strokes: InkStroke[], point: { x: number; y: number }) {
  return strokes.filter((stroke) => {
    for (let i = 0; i < stroke.points.length; i += 2) {
      const dx = stroke.points[i] - point.x;
      const dy = stroke.points[i + 1] - point.y;
      if (dx * dx + dy * dy < 16) return false;
    }
    return true;
  });
}

function strokeBox(strokes: InkStroke[]) {
  const ink = strokes.filter((stroke) => stroke.color === "ink");
  const source = ink.length ? ink : strokes;
  let minX = 100;
  let minY = 100;
  let maxX = 0;
  let maxY = 0;
  source.forEach((stroke) => {
    for (let i = 0; i < stroke.points.length; i += 2) {
      minX = Math.min(minX, stroke.points[i]);
      minY = Math.min(minY, stroke.points[i + 1]);
      maxX = Math.max(maxX, stroke.points[i]);
      maxY = Math.max(maxY, stroke.points[i + 1]);
    }
  });
  if (maxX <= minX) return { x: 8, y: 30, w: 80 };
  return { x: clamp(minX, 2, 60), y: clamp(minY, 2, 70), w: clamp(maxX - minX + 8, 36, 88) };
}

function rasterInk(strokes: InkStroke[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 700;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) return "";
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim() || "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    context.beginPath();
    context.strokeStyle = paintColor(stroke.color);
    context.lineWidth = stroke.width * 1.4;
    for (let i = 0; i < stroke.points.length; i += 2) {
      const x = (stroke.points[i] / 100) * canvas.width;
      const y = (stroke.points[i + 1] / 100) * canvas.height;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  });
  return canvas.toDataURL("image/jpeg", 0.72);
}

function pageHasMatter(page: BookPage) {
  return page.strokes.length > 0 || page.blocks.some((block) => block.type !== "text" || block.text.trim().length > 0);
}

function fontClass(font: FontKind) {
  if (font === "script") return "font-script";
  if (font === "sans") return "font-sans";
  return "font-display";
}

function sizeClass(size: "sm" | "md" | "lg", font: FontKind) {
  if (font === "script") return "text-2xl leading-tight";
  if (size === "lg") return "text-3xl leading-tight";
  if (size === "sm") return "text-sm leading-relaxed";
  return "text-lg leading-snug";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

type Box = { x: number; y: number; w: number; h: number; rotate: number };

function blockBox(block: PageBlock): Box {
  const rotate = block.rotate ?? 0;
  if (block.type === "photo") return { x: block.x, y: block.y, w: block.w, h: block.h, rotate };
  if (block.type === "text" || block.type === "voice" || block.type === "doc") return { x: block.x, y: block.y, w: block.w, h: 16, rotate };
  if (block.type === "sticker") {
    const w = block.w ?? (block.kind === "bubble" ? 40 : block.kind === "tape" ? 22 : 16);
    const h = block.kind === "tape" ? 6 : block.kind === "bubble" ? 12 : 16;
    return { x: block.x, y: block.y, w, h, rotate };
  }
  return { x: block.x, y: block.y, w: 28, h: 8, rotate };
}

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognition(): SpeechRec | null {
  const host = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}
