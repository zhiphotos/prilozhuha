import { BarBtn, Stepper } from "@/components/rod/editor-ui";
import { SOFT_SHAPES, cleanSoft, type SoftEdge, type SoftShape } from "@/lib/rod/soft-edge";

/** Растушёвка краёв: форма и сила. «Выкл» убирает поле, и блок снова с чётким краем. */
export function SoftEdgeControls({ value, onChange }: { value: unknown; onChange: (next: SoftEdge | undefined, group?: string) => void }) {
  const soft = cleanSoft(value);
  const pick = (shape: SoftShape) => onChange({ shape, amount: soft?.amount ?? 35 });
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        <BarBtn active={!soft} onClick={() => onChange(undefined)}>
          Чёткий край
        </BarBtn>
        {SOFT_SHAPES.map((item) => (
          <BarBtn key={item.id} active={soft?.shape === item.id} onClick={() => pick(item.id)}>
            {item.label}
          </BarBtn>
        ))}
      </div>
      {soft ? <Stepper label="Сила" unit="%" value={soft.amount} min={1} max={100} step={5} onChange={(amount) => onChange({ shape: soft.shape, amount }, "soft")} /> : null}
      <p className="text-xs text-muted">Край фото мягко растворяется в странице, как будто это рисунок. Ластик и растушёвка работают вместе.</p>
    </div>
  );
}
