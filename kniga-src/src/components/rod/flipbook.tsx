import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Download, PenLine, X } from "lucide-react";
import { toast } from "sonner";
import { useNav } from "@/components/rod/chrome";
import { CoverArt, PageSheet } from "@/components/rod/page-view";
import { PAGE_RATIO } from "@/lib/rod/page-style";
import { downloadFamilyBook } from "@/lib/rod/print-book";
import { turnPage } from "@/lib/rod/sounds";
import { useRod } from "@/lib/rod/store";
import type { BookPage } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

type Face =
  | { kind: "page"; page: BookPage; number: number }
  | { kind: "cover" }
  | { kind: "endpaper" }
  | { kind: "blank" }
  | { kind: "back" };

type Drag = { leaf: number; angle: number; startX: number; pointerId: number; from: number; t: number };

/** Книга с настоящим перелистыванием: обложка, развороты, страница идёт за пальцем. */
export function FlipBookScreen({ pageId }: { pageId?: string }) {
  const nav = useNav();
  const pages = useRod((state) => state.pages);
  const dedicatee = useRod((state) => state.dedicatee);
  const collector = useRod((state) => state.collector);
  const meta = useMemo(() => ({ dedicatee, collector }), [dedicatee, collector]);

  const faces = useMemo<Face[]>(() => {
    const list: Face[] = [];
    const rest = pages.slice();
    const coverPage = rest[0]?.kind === "cover" ? rest.shift() : null;
    list.push(coverPage ? { kind: "page", page: coverPage, number: 0 } : { kind: "cover" });
    list.push({ kind: "endpaper" });
    rest.forEach((page, i) => list.push({ kind: "page", page, number: i + 1 }));
    if (list.length % 2 === 1) list.push({ kind: "blank" });
    list.push({ kind: "endpaper" }, { kind: "back" });
    return list;
  }, [pages]);

  const leaves = faces.length / 2;
  const startTurned = useMemo(() => {
    if (!pageId) return 0;
    const at = faces.findIndex((face) => face.kind === "page" && face.page.id === pageId);
    if (at <= 0) return 0;
    return at % 2 === 0 ? at / 2 : (at + 1) / 2;
  }, [faces, pageId]);

  const [turned, setTurned] = useState(startTurned);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [settling, setSettling] = useState<number | null>(null);
  const [pw, setPw] = useState(180);
  const [saving, setSaving] = useState<string | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const fit = () => {
      const rect = area.getBoundingClientRect();
      setPw(Math.max(120, Math.min((rect.width - 24) / 2, (rect.height - 24) / PAGE_RATIO, 520)));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const flip = (dir: 1 | -1) => {
    const next = turned + dir;
    if (next < 0 || next > leaves) return;
    turnPage();
    setSettling(dir > 0 ? turned : turned - 1);
    setTurned(next);
    window.setTimeout(() => setSettling(null), 700);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") flip(1);
      if (event.key === "ArrowLeft") flip(-1);
      if (event.key === "Escape") nav.back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ leaf: -1, angle: 0, startX: event.clientX, pointerId: event.pointerId, from: turned, t: performance.now() });
  };

  const onMove = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) < 6 && drag.leaf < 0) return;
    const span = pw * 1.6;
    if (dx < 0 && drag.from < leaves) {
      const p = Math.min(1, -dx / span);
      setDrag({ ...drag, leaf: drag.from, angle: -180 * p });
    } else if (dx > 0 && drag.from > 0) {
      const p = Math.min(1, dx / span);
      setDrag({ ...drag, leaf: drag.from - 1, angle: -180 + 180 * p });
    }
  };

  const onUp = (event: React.PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = drag;
    setDrag(null);
    const quick = performance.now() - current.t < 280;
    if (current.leaf < 0) {
      // Просто тап: правая половина — вперёд, левая — назад.
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const x = event.clientX - rect.left;
      flip(x > rect.width / 2 ? 1 : -1);
      return;
    }
    const forward = current.leaf === current.from;
    const progress = forward ? -current.angle / 180 : (current.angle + 180) / 180;
    setSettling(current.leaf);
    window.setTimeout(() => setSettling(null), 700);
    if (progress > 0.3 || (quick && progress > 0.08)) {
      turnPage();
      setTurned(forward ? current.from + 1 : current.from - 1);
    }
  };

  const shift = turned === 0 ? -pw / 2 : turned === leaves ? pw / 2 : 0;
  const near = (i: number) => Math.abs(i - turned) <= 2;

  const printFile = () => {
    setSaving("Готовлю файл…");
    void downloadFamilyBook(pages, meta, (done, total) => setSaving(`Страница ${done + 1} из ${total}…`))
      .then(() => toast("Просмотр книги сохранён. Файл для типографии — в «Книга» → «Печать»."))
      .catch(() => toast("Файл не собрался. Попробуйте ещё раз."))
      .finally(() => setSaving(null));
  };

  const editFace = (face: Face) => {
    if (face.kind === "page") nav.replace({ id: "editor", pageId: face.page.id });
  };

  const leftFace = turned > 0 ? faces[turned * 2 - 1] : null;
  const rightFace = turned < leaves ? faces[turned * 2] : null;
  const editable = rightFace?.kind === "page" ? rightFace : leftFace?.kind === "page" ? leftFace : null;

  return (
    <div className="flip-root fixed inset-0 z-40 flex flex-col">
      <header className="flex items-center gap-2 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" className="glass-strong grid size-11 place-items-center rounded-full" aria-label="Закрыть книгу" onClick={() => nav.back()}>
          <X className="size-5" />
        </button>
        <p className="display-title flex-1 truncate text-center text-xl text-ink">Книга рода</p>
        <button type="button" disabled={Boolean(saving) || pages.length === 0} onClick={printFile} className="glass-strong flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink disabled:opacity-60">
          <Download className="size-4" />
          {saving ?? "PDF"}
        </button>
      </header>

      <div
        ref={areaRef}
        className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="relative" style={{ width: pw * 2, height: pw * PAGE_RATIO, perspective: pw * 5, transform: `translateX(${shift}px)`, transition: "transform 600ms cubic-bezier(.2,.7,.2,1)" }}>
          {/* Тень книги на столе */}
          <div
            className="pointer-events-none absolute -bottom-6 h-10 rounded-[50%] bg-ink/25 blur-xl transition-all duration-500"
            style={{ left: turned === 0 ? pw + 10 : 10, right: turned === leaves ? pw + 10 : 10 }}
          />
          {Array.from({ length: leaves }, (_, i) => {
            const isDrag = drag && drag.leaf === i;
            const angle = isDrag ? drag.angle : i < turned ? -180 : 0;
            const moving = isDrag || settling === i;
            const z = moving ? leaves + 5 : i < turned ? i + 1 : leaves - i;
            const shade = Math.sin((Math.abs(angle) / 180) * Math.PI);
            return (
              <div
                key={i}
                className="absolute top-0 h-full"
                style={{
                  left: pw,
                  width: pw,
                  zIndex: z,
                  transformOrigin: "left center",
                  transformStyle: "preserve-3d",
                  transform: `rotateY(${angle}deg)`,
                  transition: isDrag ? "none" : "transform 650ms cubic-bezier(.25,.8,.25,1)",
                }}
              >
                <FaceView face={faces[i * 2]} side="right" meta={meta} show={near(i)} shade={shade} />
                <FaceView face={faces[i * 2 + 1]} side="left" meta={meta} show={near(i)} shade={shade} back />
              </div>
            );
          })}
        </div>
      </div>

      <footer className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-2">
          <button type="button" className="glass-strong grid size-12 place-items-center rounded-full disabled:opacity-40" disabled={turned === 0} onClick={() => flip(-1)} aria-label="Назад">
            <ChevronLeft className="size-5" />
          </button>
          <div className="min-w-0 text-center">
            <p className="text-sm font-medium text-ink">{label(turned, leaves, faces)}</p>
            {editable ? (
              <button type="button" className="mt-0.5 inline-flex items-center gap-1 text-xs text-rose-deep underline" onClick={() => editFace(editable)}>
                <PenLine className="size-3" /> Изменить страницу
              </button>
            ) : (
              <p className="text-xs text-muted">Листайте пальцем влево и вправо</p>
            )}
          </div>
          <button type="button" className="glass-strong grid size-12 place-items-center rounded-full disabled:opacity-40" disabled={turned === leaves} onClick={() => flip(1)} aria-label="Вперёд">
            <ChevronRight className="size-5" />
          </button>
        </div>
      </footer>
    </div>
  );
}

function label(turned: number, leaves: number, faces: Face[]) {
  if (turned === 0) return "Обложка";
  if (turned === leaves) return "Конец книги";
  const nums = [faces[turned * 2 - 1], faces[turned * 2]].filter((f): f is Extract<Face, { kind: "page" }> => f?.kind === "page").map((f) => f.number);
  return nums.length === 2 ? `Страницы ${nums.join("–")}` : nums.length === 1 ? `Страница ${nums[0]}` : "Форзац";
}

function FaceView({ face, side, meta, show, shade, back = false }: { face: Face | undefined; side: "left" | "right"; meta: { dedicatee: string; collector: string }; show: boolean; shade: number; back?: boolean }) {
  let content: ReactNode = null;
  if (face?.kind === "page" && show) content = <PageSheet page={face.page} meta={meta} />;
  else if (face?.kind === "cover") content = <div className="h-full w-full" style={{ background: "#f8e4e8", containerType: "inline-size" }}><CoverArt meta={meta} /></div>;
  else if (face?.kind === "back") content = <BackCover />;
  else if (face?.kind === "endpaper") content = <div className="endpaper h-full w-full" />;
  else content = <div className="h-full w-full bg-[#fbf8f3]" />;
  const hard = face?.kind === "cover" || face?.kind === "back" || (face?.kind === "page" && face.page.kind === "cover");
  return (
    <div
      className={cn("absolute inset-0 overflow-hidden", side === "right" ? "rounded-r-[6px]" : "rounded-l-[6px]", hard && "ring-1 ring-[#8e3d52]/20")}
      style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: back ? "rotateY(180deg)" : undefined, boxShadow: "0 18px 40px -22px rgba(42,36,32,.55)" }}
    >
      {content}
      {/* Изгиб у корешка */}
      <div
        className="pointer-events-none absolute inset-y-0 w-[14%]"
        style={{
          [side === "right" ? "left" : "right"]: 0,
          background: `linear-gradient(${side === "right" ? "90deg" : "270deg"}, rgba(42,36,32,.22), rgba(42,36,32,0))`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 bg-ink" style={{ opacity: shade * 0.18 }} />
    </div>
  );
}

function BackCover() {
  return (
    <div className="grid h-full w-full place-items-center" style={{ background: "#f8e4e8", containerType: "inline-size" }}>
      <p className="px-[10cqw] text-center text-[#8e3d52]" style={{ fontFamily: '"Caveat", cursive', fontSize: "6cqw", lineHeight: 1.1 }}>
        Эту книгу можно продолжать.
        <br />
        Следующую страницу допишет уже другой.
      </p>
    </div>
  );
}
