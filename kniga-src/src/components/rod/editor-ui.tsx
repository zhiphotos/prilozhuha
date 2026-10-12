import { useMemo } from "react";
import { useMedia } from "@/lib/rod/media";
import { cn } from "@/lib/cn";

export function IconBtn({ label, children, onClick, disabled, active }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("grid size-11 place-items-center rounded-full text-ink transition disabled:opacity-30 enabled:active:bg-white/70", active && "bg-night text-paper")}
    >
      {children}
    </button>
  );
}

export function ToolBtn({ label, children, onClick, active }: { label: string; children: React.ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex min-h-[3.4rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-[1.2rem] text-[11.5px] font-medium leading-none transition", active ? "bg-white text-ink" : "text-paper/90 active:bg-white/15")}
    >
      {children}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-3.64 19.31c-.09-.79-.17-2 .03-2.86l1.2-5.08s-.3-.61-.3-1.5c0-1.41.82-2.46 1.84-2.46.87 0 1.29.65 1.29 1.43 0 .87-.56 2.18-.84 3.39-.24 1.01.51 1.84 1.51 1.84 1.81 0 3.2-1.91 3.2-4.66 0-2.44-1.75-4.14-4.25-4.14-2.9 0-4.6 2.17-4.6 4.42 0 .87.34 1.81.76 2.32.08.1.09.19.07.29l-.28 1.15c-.05.19-.15.23-.34.14-1.27-.59-2.06-2.45-2.06-3.95 0-3.21 2.33-6.17 6.73-6.17 3.53 0 6.28 2.52 6.28 5.89 0 3.51-2.21 6.34-5.29 6.34-1.03 0-2-.54-2.33-1.17l-.64 2.42c-.23.89-.85 2-1.27 2.68A10 10 0 1 0 12 2z" />
    </svg>
  );
}

export function BarBtn({ children, onClick, active, label, danger, disabled, wide }: { children: React.ReactNode; onClick: () => void; active?: boolean; label?: string; danger?: boolean; disabled?: boolean; wide?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full text-[13px] font-medium transition disabled:opacity-40",
        wide === false ? "w-11" : "px-3.5",
        active ? "bg-night text-paper" : danger ? "bg-rose-deep text-paper" : "bg-white/80 text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function BigChoice({ icon, title, text, onClick }: { icon: React.ReactNode; title: string; text: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex flex-col items-start gap-2 rounded-3xl bg-white/75 p-4 text-left active:scale-[0.98]">
      <span className="grid size-10 place-items-center rounded-full bg-night text-paper">{icon}</span>
      <span>
        <span className="block font-semibold text-ink">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );
}

export function MenuRow({ icon, label, onClick, disabled, danger }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={cn("flex min-h-12 items-center gap-3 rounded-2xl bg-white/70 px-4 text-left text-sm font-medium disabled:opacity-40", danger ? "text-rose-deep" : "text-ink")}>
      {icon}
      {label}
    </button>
  );
}

export function ArchiveThumb({ src, alt, onClick }: { src: string; alt: string; onClick: () => void }) {
  const url = useMedia(src);
  return (
    <button type="button" onClick={onClick} className="block aspect-square w-full overflow-hidden rounded-xl bg-line">
      {url ? <img src={url} alt={alt || "Фото"} className="h-full w-full object-cover" /> : null}
    </button>
  );
}

/** Ползунок с числом и кнопками − / +. */
export function Stepper({ label, value, min, max, step = 1, unit = "px", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const shown = useMemo(() => (Number.isInteger(value) ? String(value) : value.toFixed(1)), [value]);
  return (
    <div className="flex items-center gap-2">
      <span className="hidden w-14 shrink-0 text-xs text-muted min-[420px]:block">{label}</span>
      <button type="button" aria-label="Меньше" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/80 text-lg leading-none" onClick={() => onChange(clamp(value - step))}>
        −
      </button>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(clamp(Number(event.target.value)))} className="rgb-range h-2 min-w-0 flex-1 appearance-none rounded-full bg-ink/15" />
      <button type="button" aria-label="Больше" className="grid size-10 shrink-0 place-items-center rounded-full bg-white/80 text-lg leading-none" onClick={() => onChange(clamp(value + step))}>
        +
      </button>
      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink">
        {shown} {unit}
      </span>
    </div>
  );
}
