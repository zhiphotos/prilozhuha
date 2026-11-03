import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Горизонтальная лента карточек, которую листают пальцем (как фильтры в фоторедакторах).
 * scroll-snap подтягивает карточку к краю, overscroll-x-contain и stopPropagation не дают свайпу двигать страницу или блок под окном. */
export function Strip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="listbox"
      aria-label={label}
      className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1"
      style={{ touchAction: "pan-x pan-y", scrollbarWidth: "none" }}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchMove={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** Карточка ленты: превью, название под ним, текущая выбрана рамкой. */
export function StripItem({ label, selected, onClick, children, round }: { label: string; selected: boolean; onClick: () => void; children?: ReactNode; round?: boolean }) {
  return (
    <button type="button" role="option" aria-selected={selected} onClick={onClick} className="flex w-[76px] shrink-0 snap-start flex-col items-center gap-1 text-center">
      <span className={cn("relative block size-[68px] overflow-hidden border border-ink/15 bg-white/70", round ? "rounded-full" : "rounded-2xl", selected && "ring-2 ring-ink ring-offset-2 ring-offset-paper")}>{children}</span>
      <span className={cn("w-full truncate text-[11px] leading-tight", selected ? "font-semibold text-ink" : "text-muted")}>{label}</span>
    </button>
  );
}
