import { useMemo, useState } from "react";
import { Sheet } from "@/components/rod/chrome";
import { TreeStage } from "@/components/tree/TreeStage";
import { demoTree } from "@/lib/tree/demo";
import { layoutCameo } from "@/lib/tree/cameo";
import { layoutGzhel } from "@/lib/tree/gzhel";
import { layoutBoheme } from "@/lib/tree/boheme";
import { layoutTaiga } from "@/lib/tree/taiga";
import { layoutPoster } from "@/lib/tree/poster";
import { layoutTree } from "@/lib/tree/layout";
import type { TreeStyle } from "@/lib/tree/styles";
import type { TreeFlow } from "@/lib/tree/ui-store";

/** Готовые образцы стилей (картинки от Дарины): показываем их вместо рисунка тестового древа. */
const SAMPLE: Partial<Record<TreeStyle, string>> = {
  cameo: "tree/preview/cameo.jpg",
  taiga: "tree/preview/taiga.jpg",
};

const TITLE: Record<TreeStyle, string> = {
  work: "Схема",
  carved: "Древо",
  cameo: "Камея",
  gzhel: "Гжель",
  boheme: "Богема",
  taiga: "Тайга",
};

/** Превью стиля на тестовом древе из Грока (demoTree). Только смотреть: настоящее древо не меняется. */
export function StylePreview({ style, onPick, onOpen, onClose }: { style: TreeStyle; onPick: (style: TreeStyle) => void; onOpen: () => void; onClose: () => void }) {
  const [flow] = useState<TreeFlow>("down");
  const data = useMemo(() => demoTree(), []);
  const people = data.people;
  const unions = data.unions;
  const focusId = data.focusId;
  const layout = useMemo(() => layoutTree(people, unions, focusId, flow), [people, unions, focusId, flow]);
  const poster = useMemo(() => (style === "carved" ? layoutPoster(people, unions, focusId, flow) : null), [style, people, unions, focusId, flow]);
  const cameo = useMemo(() => (style === "cameo" ? layoutCameo(people, unions, focusId, flow) : null), [style, people, unions, focusId, flow]);
  const gzhel = useMemo(() => (style === "gzhel" ? layoutGzhel(people, unions, focusId, flow) : null), [style, people, unions, focusId, flow]);
  const boheme = useMemo(() => (style === "boheme" ? layoutBoheme(people, unions, focusId, flow) : null), [style, people, unions, focusId, flow]);
  const taiga = useMemo(() => (style === "taiga" ? layoutTaiga(people, unions, focusId, flow) : null), [style, people, unions, focusId, flow]);
  return (
    <Sheet title={`Так выглядит «${TITLE[style]}»`} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-sm text-muted">Это пример оформления. Ваше древо не меняется. Выберите стиль, который нравится, и откройте его.</p>
        {SAMPLE[style] ? (
          <div className="max-h-[56dvh] overflow-auto rounded-2xl border border-line bg-black">
            <img src={`${import.meta.env.BASE_URL}${SAMPLE[style]}`} alt={`Образец стиля «${TITLE[style]}»`} className="block w-full" draggable={false} />
          </div>
        ) : null}
        <div className={`tree-root relative h-[52dvh] min-h-[22rem] overflow-hidden rounded-2xl border border-line${SAMPLE[style] ? " hidden" : ""}`} data-theme="paper">
          <TreeStage
            layout={layout}
            people={people}
            unions={unions}
            focusId={focusId}
            selectedId={null}
            centerReq={null}
            radius={null}
            fitReq={0}
            onRadius={() => undefined}
            onSelectPerson={() => undefined}
            onSelectUnion={() => undefined}
            onClear={() => undefined}
        onLocate={() => undefined}
            style={style}
            onStyle={onPick}
            stylesLocked={false}
            poster={poster}
            cameo={cameo}
            gzhel={gzhel}
            boheme={boheme}
            taiga={taiga}
            flow={flow}
            onFlow={() => undefined}
          />
        </div>
        <button type="button" className="min-h-12 rounded-full bg-moss px-5 text-sm font-semibold text-paper" onClick={onOpen}>
          Открыть стиль «{TITLE[style]}» в моём древе
        </button>
      </div>
    </Sheet>
  );
}
