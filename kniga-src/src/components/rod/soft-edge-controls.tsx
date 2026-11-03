import { BarBtn, Stepper } from "@/components/rod/editor-ui";
import { Strip, StripItem } from "@/components/rod/strip";
import { SOFT_SHAPES, cleanSoft, maskStyleFromUrls, softDataUrl, type SoftEdge, type SoftShape } from "@/lib/rod/soft-edge";

/** Растушёвка краёв: лента форм (листается пальцем) и сила. «Чёткий край» убирает поле, и блок снова с чётким краем. */
export function SoftEdgeControls({ value, onChange, src }: { value: unknown; onChange: (next: SoftEdge | undefined, group?: string) => void; src?: string }) {
  const soft = cleanSoft(value);
  const pick = (shape: SoftShape) => onChange({ shape, amount: soft?.amount ?? 35 });
  const thumb = (shape: SoftShape) => (
    <span className="absolute inset-1 block" style={maskStyleFromUrls([softDataUrl({ shape, amount: 55 }, 100)])}>
      {src ? <img src={src} alt="" className="size-full object-cover" draggable={false} /> : <span className="block size-full bg-rose-deep/70" />}
    </span>
  );
  return (
    <div className="grid gap-2">
      <Strip label="Форма мягкого края">
        <StripItem label="Чёткий край" selected={!soft} onClick={() => onChange(undefined)}>
          {src ? <img src={src} alt="" className="absolute inset-0 size-full object-cover" draggable={false} /> : <span className="absolute inset-1 block bg-rose-deep/70" />}
        </StripItem>
        {SOFT_SHAPES.map((item) => (
          <StripItem key={item.id} label={item.label} selected={soft?.shape === item.id} onClick={() => pick(item.id)}>
            {thumb(item.id)}
          </StripItem>
        ))}
      </Strip>
      {soft ? <Stepper label="Сила" unit="%" value={soft.amount} min={1} max={100} step={5} onChange={(amount) => onChange({ shape: soft.shape, amount }, "soft")} /> : null}
      {soft ? <BarBtn onClick={() => onChange(undefined)} label="Вернуть чёткий край">Сбросить</BarBtn> : null}
      <p className="text-xs text-muted">Край фото мягко растворяется в странице, как будто это рисунок. Ластик и растушёвка работают вместе.</p>
    </div>
  );
}
