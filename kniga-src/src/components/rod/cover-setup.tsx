import { BookOpen } from "lucide-react";
import { ColorRow } from "@/components/rod/color-sheet";
import { FontChips } from "@/components/rod/editor-bars";
import { Button, Sheet, useNav } from "@/components/rod/chrome";
import { Stepper } from "@/components/rod/editor-ui";
import { spineText } from "@/lib/rod/print-book";
import { PAPER_BG } from "@/lib/rod/print-book";
import { fontFamily, isDark } from "@/lib/rod/page-style";
import { backPage, useRod } from "@/lib/rod/store";
import { BACK_ID } from "@/lib/rod/types";

/** Лицевая сторона, корешок и задняя сторона обложки: цвет, надпись, оформление. */
export function CoverSetup({ onClose }: { onClose: () => void }) {
  const nav = useNav();
  const pages = useRod((state) => state.pages);
  const back = useRod((state) => state.back);
  const spine = useRod((state) => state.spine);
  const setSpine = useRod((state) => state.setSpine);
  const updatePage = useRod((state) => state.updatePage);
  const dedicatee = useRod((state) => state.dedicatee);
  const collector = useRod((state) => state.collector);
  const print = useRod((state) => state.print);
  const cover = pages[0]?.kind === "cover" ? pages[0] : null;
  const backNow = back ?? backPage(cover);
  const frontColor = cover?.bg ?? PAPER_BG[cover?.paper ?? "rose"];
  const backColor = backNow.bg ?? PAPER_BG[backNow.paper];
  const spineColor = spine.bg ?? frontColor;
  const label = spineText(spine, { dedicatee, collector });

  const paintAll = (color: string) => {
    if (cover) updatePage(cover.id, (p) => ({ ...p, bg: color }));
    updatePage(BACK_ID, (p) => ({ ...p, bg: color }));
    setSpine({ bg: color });
  };

  return (
    <Sheet title="Обложка целиком" onClose={onClose} className="max-w-xl">
      <p className="mb-2 text-sm text-muted">Так обложка ляжет на разворот: задняя сторона, корешок, лицевая.</p>
      <div className="flex items-stretch overflow-hidden rounded-2xl border border-ink/10 shadow-sm" style={{ height: 130 }}>
        <div className="grid flex-1 place-items-center text-xs text-ink/75" style={{ background: backColor }}>
          задняя
        </div>
        <div className="grid w-9 place-items-center overflow-hidden" style={{ background: spineColor }}>
          <span className="whitespace-nowrap" style={{ writingMode: "vertical-rl", fontSize: spinePreviewPx(spine.size, print.size, print.spine), maxHeight: "88%", overflow: "hidden", color: spine.color ?? (isDark(spineColor) ? "#fbf8f3" : "#2a2420"), fontFamily: fontFamily(spine.font) }}>
            {label}
          </span>
        </div>
        <div className="grid flex-1 place-items-center text-xs text-ink/75" style={{ background: frontColor }}>
          лицевая
        </div>
      </div>

      <p className="mb-2 mt-4 text-sm font-medium text-ink">Один цвет на всю обложку</p>
      <ColorRow compact value={frontColor} onPick={paintAll} title="Цвет обложки" />

      <div className="mt-4 grid gap-2">
        <Button variant="soft" className="w-full" onClick={() => { onClose(); nav.go({ id: "editor", pageId: BACK_ID }); }}>
          <BookOpen className="size-4" /> Оформить заднюю сторону (текст, фото, цвет)
        </Button>
        {cover ? (
          <Button variant="soft" className="w-full" onClick={() => { onClose(); nav.go({ id: "editor", pageId: cover.id }); }}>
            Оформить лицевую сторону
          </Button>
        ) : null}
      </div>

      <p className="mb-1.5 mt-5 text-base font-semibold text-ink">Корешок ({print.spine} мм): надпись, размер, цвет</p>
      <input className="field" value={spine.text} placeholder={label} onChange={(event) => setSpine({ text: event.target.value })} />
      <div className="mt-3">
        <Stepper label="Размер надписи" value={spine.size} min={0} max={120} unit={spine.size ? "px" : "авто"} onChange={(size) => setSpine({ size })} />
        <p className="mt-1 text-xs text-muted">«Авто» подгоняет по толщине корешка. Своё число делает надпись крупнее или мельче, но выше толщины корешка она не вырастет.</p>
      </div>
      <p className="mb-1 mt-3 text-xs text-muted">Цвет корешка</p>
      <ColorRow compact value={spine.bg} onPick={(bg) => setSpine({ bg })} onReset={spine.bg ? () => setSpine({ bg: undefined }) : undefined} title="Цвет корешка" />
      <p className="mb-1 mt-3 text-xs text-muted">Цвет надписи</p>
      <ColorRow compact value={spine.color} onPick={(color) => setSpine({ color })} onReset={spine.color ? () => setSpine({ color: undefined }) : undefined} title="Цвет надписи на корешке" />
      <div className="no-scrollbar -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1">
        <FontChips value={spine.font} onPick={(font) => setSpine({ font })} />
      </div>
      <Button className="mt-4 w-full" onClick={onClose}>
        Готово
      </Button>
    </Sheet>
  );
}

/** Размер надписи в превью: тот же расчёт, что в печати (`downloadPrintCover`), в масштабе превью, где корешок 36 px. */
function spinePreviewPx(size: number, trimCm: number, spineMm: number): number {
  const spineBox = 36;
  if (!size || spineMm <= 0) return spineBox * 0.55;
  return Math.max(6, Math.min(spineBox * 0.9, (size * trimCm * 0.36) / spineMm));
}
