import { useEffect, useState } from "react";
import { Pipette } from "lucide-react";
import { Button, Sheet } from "@/components/rod/chrome";
import { SWATCHES } from "@/lib/rod/page-style";
import { cn } from "@/lib/cn";

const RECENT_KEY = "kniga-recent-colors";

export function recentColors(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    return Array.isArray(list) ? list.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 12) : [];
  } catch {
    return [];
  }
}

function remember(color: string) {
  try {
    const next = [color.toLowerCase(), ...recentColors().filter((c) => c.toLowerCase() !== color.toLowerCase())].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* без запоминания */
  }
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [196, 93, 114];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const rgbToHex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;

function fixHex(text: string): string | null {
  let t = text.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(t)) t = t.split("").map((c) => c + c).join("");
  return /^[0-9a-f]{6}$/i.test(t) ? `#${t.toLowerCase()}` : null;
}

/** Полная палитра: любой цвет по RGB или коду, последние цвета, пипетка. */
export function ColorSheet({
  title = "Цвет",
  value,
  onPick,
  onClose,
  onPipette,
  onReset,
  allowNone,
  onNone,
}: {
  title?: string;
  value?: string;
  onPick: (color: string) => void;
  onClose: () => void;
  onPipette?: () => void;
  onReset?: () => void;
  allowNone?: boolean;
  onNone?: () => void;
}) {
  const [color, setColor] = useState(value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#c45d72");
  const [hex, setHex] = useState(color);
  const [r, g, b] = hexToRgb(color);
  const apply = (next: string) => {
    setColor(next);
    setHex(next);
    onPick(next);
  };
  useEffect(() => () => remember(color), [color]);
  const recent = recentColors();
  return (
    <Sheet title={title} onClose={onClose} dim={false}>
      <div className="flex items-center gap-3">
        <span className="size-14 shrink-0 rounded-2xl border border-ink/15 shadow-inner" style={{ background: color }} />
        <input
          className="field !w-32 font-mono uppercase"
          value={hex}
          maxLength={7}
          onChange={(event) => {
            setHex(event.target.value);
            const fixed = fixHex(event.target.value);
            if (fixed) {
              setColor(fixed);
              onPick(fixed);
            }
          }}
          aria-label="Код цвета"
        />
        {onPipette ? (
          <Button variant="soft" className="min-h-11 flex-1" onClick={onPipette}>
            <Pipette className="size-4" /> Пипетка
          </Button>
        ) : null}
      </div>
      <div className="mt-3 grid gap-2">
        {(
          [
            ["R", r, (v: number) => rgbToHex(v, g, b), `linear-gradient(90deg, ${rgbToHex(0, g, b)}, ${rgbToHex(255, g, b)})`],
            ["G", g, (v: number) => rgbToHex(r, v, b), `linear-gradient(90deg, ${rgbToHex(r, 0, b)}, ${rgbToHex(r, 255, b)})`],
            ["B", b, (v: number) => rgbToHex(r, g, v), `linear-gradient(90deg, ${rgbToHex(r, g, 0)}, ${rgbToHex(r, g, 255)})`],
          ] as const
        ).map(([label, value, make, bg]) => (
          <label key={label} className="flex items-center gap-3 text-xs text-muted">
            <span className="w-3 font-semibold text-ink">{label}</span>
            <input type="range" min={0} max={255} value={value} onChange={(event) => apply(make(Number(event.target.value)))} className="rgb-range h-3 flex-1 appearance-none rounded-full" style={{ background: bg }} />
            <span className="w-8 text-right tabular-nums text-ink">{value}</span>
          </label>
        ))}
      </div>
      {recent.length ? (
        <>
          <p className="mb-1.5 mt-4 text-sm text-muted">Недавние</p>
          <Swatches colors={recent} value={color} onPick={apply} />
        </>
      ) : null}
      <p className="mb-1.5 mt-4 text-sm text-muted">Палитра</p>
      <Swatches colors={SWATCHES} value={color} onPick={apply} />
      <div className="mt-4 flex flex-wrap gap-2">
        {allowNone && onNone ? (
          <Button variant="soft" onClick={onNone}>
            Без цвета
          </Button>
        ) : null}
        {onReset ? (
          <Button variant="soft" onClick={onReset}>
            Как было
          </Button>
        ) : null}
        <Button className="ml-auto" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Sheet>
  );
}

function Swatches({ colors, value, onPick }: { colors: string[]; value: string; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={c}
          onClick={() => onPick(c)}
          className={cn("size-10 rounded-full border border-ink/15 shadow-sm", value.toLowerCase() === c.toLowerCase() && "ring-2 ring-night ring-offset-2")}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

/** Ряд цветов: быстрые + «свой цвет» (открывает полную палитру). */
export function ColorRow({
  value,
  onPick,
  onReset,
  compact = false,
  onPipette,
  title,
}: {
  value?: string;
  onPick: (color: string) => void;
  onReset?: () => void;
  compact?: boolean;
  onPipette?: () => void;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("flex items-center gap-2", compact ? "no-scrollbar -mx-1 overflow-x-auto px-1 py-1 [&>*]:shrink-0" : "flex-wrap")}>
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={color}
          onClick={() => onPick(color)}
          className={cn("size-10 rounded-full border border-ink/15 shadow-sm", value?.toLowerCase() === color && "ring-2 ring-night ring-offset-2")}
          style={{ background: color }}
        />
      ))}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative grid size-10 cursor-pointer place-items-center overflow-hidden rounded-full border border-ink/15 text-xs font-bold text-ink"
        style={{ background: "conic-gradient(#f66, #fd6, #6d6, #6df, #66f, #f6f, #f66)" }}
        title="Любой цвет"
        aria-label="Любой цвет"
      >
        <span className="rounded-full bg-white/85 px-1">+</span>
      </button>
      {onReset ? (
        <button type="button" onClick={onReset} className="h-9 rounded-full bg-white/70 px-3 text-xs text-ink">
          Как было
        </button>
      ) : null}
      {open ? (
        <ColorSheet
          title={title}
          value={value}
          onPick={onPick}
          onClose={() => setOpen(false)}
          onPipette={
            onPipette
              ? () => {
                  setOpen(false);
                  onPipette();
                }
              : undefined
          }
        />
      ) : null}
    </div>
  );
}
