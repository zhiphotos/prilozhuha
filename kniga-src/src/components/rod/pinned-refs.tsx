import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from "lucide-react";
import { useMedia } from "@/lib/rod/media";

const POS_KEY = "kniga-pinned-pos";

/** Картинка-подсказка из «Вайба»: плавает рядом с работой, её можно двигать, увеличивать и листать. На страницу и в печать не попадает. */
/** Цвет пикселя картинки-референса в точке клика (в долях 0..1 от её размера). */
async function pixelFromUrl(url: string, fx: number, fy: number): Promise<string | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(fx * canvas.width)));
  const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(fy * canvas.height)));
  const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

export function PinnedRefs({ refs, onUnpin, pipette, onPick }: { refs: string[]; onUnpin: (ref: string) => void; pipette?: boolean; onPick?: (color: string) => void }) {
  const [at, setAt] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick((v) => v + 1);
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  const [big, setBig] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(POS_KEY) ?? "null") as { x: number; y: number } | null;
      if (raw && Number.isFinite(raw.x) && Number.isFinite(raw.y)) return raw;
    } catch {
      /* по умолчанию */
    }
    return { x: 10, y: Math.max(80, window.innerHeight - 330) };
  });
  const drag = useRef<{ id: number; x: number; y: number; px: number; py: number } | null>(null);
  const index = Math.min(at, refs.length - 1);
  const ref = refs[index];
  const url = useMedia(ref);
  if (!ref) return null;
  const w = big ? Math.min(280, window.innerWidth - 20) : 120;
  const left = Math.min(Math.max(0, pos.x), Math.max(0, window.innerWidth - w - 4));
  const top = Math.min(Math.max(0, pos.y), Math.max(0, window.innerHeight - 120));
  return (
    <div className="fixed z-[47] touch-none select-none rounded-2xl bg-white/90 p-1 shadow-xl backdrop-blur" style={{ left, top, width: w }}>
      <div
        className="flex cursor-grab items-center justify-between gap-1 px-1 pb-1 active:cursor-grabbing"
        onPointerDown={(event) => {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, px: left, py: top };
        }}
        onPointerMove={(event) => {
          const d = drag.current;
          if (d && d.id === event.pointerId) setPos({ x: d.px + event.clientX - d.x, y: d.py + event.clientY - d.y });
        }}
        onPointerUp={() => {
          drag.current = null;
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(pos));
          } catch {
            /* без запоминания */
          }
        }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-ink/75">Подсказка</span>
        <span className="flex items-center">
          <button type="button" aria-label={big ? "Меньше" : "Крупнее"} className="grid size-8 place-items-center" onPointerDown={(e) => e.stopPropagation()} onClick={() => setBig(!big)}>
            {big ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button type="button" aria-label="Убрать с экрана" className="grid size-8 place-items-center" onPointerDown={(e) => e.stopPropagation()} onClick={() => onUnpin(ref)}>
            <X className="size-4" />
          </button>
        </span>
      </div>
      {url ? (
        <img
          src={url}
          alt="Подсказка"
          draggable={false}
          className={`block w-full rounded-xl ${pipette ? "cursor-crosshair ring-2 ring-moss" : ""}`}
          onPointerDown={(e) => {
            if (!pipette) return;
            e.stopPropagation();
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const fx = (e.clientX - rect.left) / rect.width;
            const fy = (e.clientY - rect.top) / rect.height;
            void pixelFromUrl(url, fx, fy).then((color) => {
              if (color) onPick?.(color);
            });
          }}
        />
      ) : <div className="aspect-square animate-pulse rounded-xl bg-line" />}
      {refs.length > 1 ? (
        <div className="mt-1 flex items-center justify-between px-1 text-xs text-ink/70">
          <button type="button" aria-label="Предыдущая" className="grid size-8 place-items-center" onClick={() => setAt((index - 1 + refs.length) % refs.length)}>
            <ChevronLeft className="size-4" />
          </button>
          {index + 1} / {refs.length}
          <button type="button" aria-label="Следующая" className="grid size-8 place-items-center" onClick={() => setAt((index + 1) % refs.length)}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
