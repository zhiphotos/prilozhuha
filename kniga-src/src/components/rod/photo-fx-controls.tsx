import { useEffect, useState } from "react";
import { BarBtn, Stepper } from "@/components/rod/editor-ui";
import { FX_COLORS, FX_LIST, cleanFx, pickFx, renderFx, type FxId, type PhotoFx } from "@/lib/rod/photo-fx";
import { cn } from "@/lib/cn";

// Миниатюры пресетов на самом фото: считаются по очереди и один раз (кэш по фото), чтобы телефон не зависал.
const THUMBS = new Map<string, string>();

function useThumbs(src: string): Record<string, string> {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!src) return;
    let alive = true;
    const img = new Image();
    img.onload = () => {
      let i = 0;
      const next = () => {
        if (!alive || i >= FX_LIST.length) return;
        const def = FX_LIST[i++];
        const key = `${src.length}:${src.slice(-40)}|${def.id}`;
        if (!THUMBS.has(key)) {
          THUMBS.set(key, renderFx(img, pickFx(def.id), 120).toDataURL("image/jpeg", 0.8));
          tick((n) => n + 1);
        }
        window.setTimeout(next, 0);
      };
      next();
    };
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);
  const out: Record<string, string> = {};
  for (const def of FX_LIST) {
    const v = THUMBS.get(`${src.length}:${src.slice(-40)}|${def.id}`);
    if (v) out[def.id] = v;
  }
  return out;
}

function Swatches({ label, value, onPick }: { label: string; value: string; onPick: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 text-xs text-muted">{label}</span>
      {FX_COLORS.map((hex) => (
        <button key={hex} type="button" aria-label={`${label} ${hex}`} onClick={() => onPick(hex)} className={cn("size-7 rounded-full border border-ink/20", value === hex && "ring-2 ring-ink ring-offset-1")} style={{ background: hex }} />
      ))}
    </div>
  );
}

/** Пресеты обработки фото: один тап, ползунок силы, цвета для дуотона и ризографа, «Без эффекта» возвращает оригинал. */
export function PhotoFxControls({ src, value, onChange }: { src: string; value: unknown; onChange: (next: PhotoFx | undefined, group?: string) => void }) {
  const fx = cleanFx(value);
  const thumbs = useThumbs(src);
  const twoColors = fx?.id === "duotone" || fx?.id === "riso";
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-1.5">
        <button type="button" onClick={() => onChange(undefined)} aria-pressed={!fx} className={cn("grid aspect-square place-items-center rounded-xl border border-ink/15 bg-white/60 px-1 text-center text-[11px] leading-tight", !fx && "ring-2 ring-ink")}>
          Без эффекта
        </button>
        {FX_LIST.map((def) => (
          <button key={def.id} type="button" aria-pressed={fx?.id === def.id} onClick={() => onChange(pickFx(def.id as FxId, fx))} className={cn("relative aspect-square overflow-hidden rounded-xl border border-ink/15 bg-white/60", fx?.id === def.id && "ring-2 ring-ink")}>
            {thumbs[def.id] ? <img src={thumbs[def.id]} alt="" className="absolute inset-0 size-full object-cover" draggable={false} /> : null}
            <span className="absolute inset-x-0 bottom-0 bg-night/65 px-0.5 py-0.5 text-center text-[10px] leading-tight text-paper">{def.label}</span>
          </button>
        ))}
      </div>
      {fx ? <Stepper label="Сила" unit="%" value={fx.amount} min={1} max={100} step={5} onChange={(amount) => onChange({ ...fx, amount }, "fx")} /> : null}
      {fx && twoColors ? (
        <div className="grid gap-1.5">
          <Swatches label={fx.id === "riso" ? "Краска 1" : "Тени"} value={fx.c1 ?? ""} onPick={(c1) => onChange({ ...fx, c1 })} />
          <Swatches label={fx.id === "riso" ? "Краска 2" : "Свет"} value={fx.c2 ?? ""} onPick={(c2) => onChange({ ...fx, c2 })} />
        </div>
      ) : null}
      {fx ? (
        <BarBtn onClick={() => onChange(undefined)} label="Вернуть фото без обработки">
          Сбросить эффект
        </BarBtn>
      ) : null}
      <p className="text-xs text-muted">Оригинал фото не меняется: эффект можно сменить или убрать в любой момент. В печати вид тот же.</p>
    </div>
  );
}
