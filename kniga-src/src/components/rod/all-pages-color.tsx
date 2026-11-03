import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { ColorSheet } from "@/components/rod/color-sheet";
import { previewRecolor } from "@/lib/rod/page-colors";
import { useRod } from "@/lib/rod/store";

/** Цвет фона и букв сразу на всех страницах: показывает, сколько страниц и текстов изменится, спрашивает и даёт отменить. */
export function AllPagesColor({ onClose }: { onClose: () => void }) {
  const pages = useRod((state) => state.pages);
  const recolor = useRod((state) => state.recolorAllPages);
  const revert = useRod((state) => state.revertRecolor);
  const [bg, setBg] = useState<string | undefined>();
  const [text, setText] = useState<string | undefined>();
  const [keepCustom, setKeepCustom] = useState(true);
  const [includeCover, setIncludeCover] = useState(false);
  const [picking, setPicking] = useState<"bg" | "text" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const options = { bg, text, keepCustom, includeCover };
  const preview = useMemo(() => previewRecolor(pages, { bg, text, keepCustom, includeCover }), [pages, bg, text, keepCustom, includeCover]);
  const nothing = !bg && !text;

  const apply = () => {
    const result = recolor(options);
    onClose();
    if (!result.pageCount && !result.textCount) return toast("Ничего не изменилось: везде уже такой цвет или стоят свои цвета.");
    toast(`Готово: страниц ${result.pageCount}, текстов ${result.textCount}`, { duration: 12000, action: { label: "Отменить", onClick: () => revert(result.undo) } });
  };

  const swatch = (color: string | undefined) => <span className="size-6 shrink-0 rounded-full border border-ink/20" style={{ background: color ?? "transparent" }} />;

  return (
    <Sheet title="Цвет всех страниц" onClose={onClose}>
      <div className="grid gap-3">
        <button type="button" className="glass flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left" onClick={() => setPicking("bg")}>
          {swatch(bg)} <span className="flex-1">Фон страниц</span> <span className="text-sm text-muted">{bg ?? "не менять"}</span>
        </button>
        <button type="button" className="glass flex min-h-12 items-center gap-3 rounded-2xl px-4 text-left" onClick={() => setPicking("text")}>
          {swatch(text)} <span className="flex-1">Цвет текста</span> <span className="text-sm text-muted">{text ?? "не менять"}</span>
        </button>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" className="mt-1 size-5" checked={keepCustom} onChange={(event) => setKeepCustom(event.target.checked)} />
          <span>Не трогать страницы и тексты, у которых цвет уже выбран отдельно</span>
        </label>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input type="checkbox" className="mt-1 size-5" checked={includeCover} onChange={(event) => setIncludeCover(event.target.checked)} />
          <span>Красить и обложку</span>
        </label>
        {!nothing ? <p className="text-sm text-muted">Изменится: страниц {preview.pageCount}, текстов {preview.textCount}.</p> : <p className="text-sm text-muted">Выберите фон, цвет текста или оба.</p>}
        {confirm ? (
          <div className="grid gap-2">
            <p className="text-sm text-ink">Применить ко всей книге? После этого появится кнопка «Отменить».</p>
            <div className="flex gap-2">
              <Button className="min-h-11 flex-1" onClick={apply}>Да, применить</Button>
              <Button variant="ghost" className="min-h-11" onClick={() => setConfirm(false)}>Назад</Button>
            </div>
          </div>
        ) : (
          <Button className="min-h-11" disabled={nothing || (!preview.pageCount && !preview.textCount)} onClick={() => setConfirm(true)}>
            Применить ко всем страницам
          </Button>
        )}
      </div>
      {picking ? (
        <ColorSheet
          title={picking === "bg" ? "Фон всех страниц" : "Цвет всего текста"}
          value={picking === "bg" ? bg : text}
          onPick={(color) => (picking === "bg" ? setBg(color) : setText(color))}
          onClose={() => setPicking(null)}
          onReset={() => (picking === "bg" ? setBg(undefined) : setText(undefined))}
        />
      ) : null}
    </Sheet>
  );
}
