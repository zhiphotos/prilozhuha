import { useState } from "react";
import { Sheet } from "@/components/rod/chrome";
import { LAYOUT_COUNTS, PHOTO_LAYOUTS, type PhotoLayout } from "@/lib/rod/photo-layouts";

function Thumb({ layout }: { layout: PhotoLayout }) {
  return (
    <div className="relative aspect-square w-full rounded-lg bg-paper/60 ring-1 ring-ink/10">
      {layout.rects.map((r, i) => (
        <span
          key={i}
          className={`absolute bg-ink/25 ${r.frame === "polaroid" ? "border-2 border-white shadow" : ""}`}
          style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, transform: r.rotate ? `rotate(${r.rotate}deg)` : undefined, borderRadius: r.shape === "round" ? "50%" : r.shape === "arch" ? "50% 50% 2px 2px / 36% 36% 2px 2px" : r.shape === "rounded" ? "14%" : undefined }}
        />
      ))}
      {(layout.texts ?? []).map((t, i) => (
        <span key={`t${i}`} className="absolute h-[3px] rounded bg-ink/45" style={{ left: `${t.x}%`, top: `${t.y + 1}%`, width: `${t.w}%` }} />
      ))}
    </div>
  );
}

/** Макеты расположения фото: выбрали число фото и вид, на странице встали пустые рамки. */
export function PhotoLayoutsSheet({ onClose, onPick }: { onClose: () => void; onPick: (layout: PhotoLayout) => void }) {
  const [count, setCount] = useState<number | null>(null);
  const shown = PHOTO_LAYOUTS.filter((l) => count === null || l.n === count);
  return (
    <Sheet title="Макеты фото" onClose={onClose}>
      <p className="text-sm text-muted">Выберите макет: на странице встанут пустые рамки. Нажмите на рамку и добавьте своё фото, потом его можно двигать и подрезать.</p>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Сколько фото">
        {[null, ...LAYOUT_COUNTS].map((n) => (
          <button
            key={n ?? "all"}
            type="button"
            onClick={() => setCount(n)}
            aria-pressed={count === n}
            className={`rounded-full px-3 py-1.5 text-sm ${count === n ? "bg-ink text-paper" : "bg-white/70 text-ink"}`}
          >
            {n === null ? "Все" : `${n} фото`}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {shown.map((layout) => (
          <button key={layout.id} type="button" onClick={() => onPick(layout)} className="text-left" aria-label={layout.label}>
            <Thumb layout={layout} />
            <span className="mt-1 block text-[11px] leading-tight text-ink">{layout.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
