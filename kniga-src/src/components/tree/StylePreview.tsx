import { schemeAnchor, schemeLayout } from "@/lib/tree/scheme";
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
import type { Person, Union } from "@/lib/tree/types";

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
type Real = { people: Person[]; unions: Union[]; focusId: string };

export function StylePreview({ style, real, onPick, onOpen, onClose }: { style: TreeStyle; real?: Real; onPick: (style: TreeStyle) => void; onOpen: () => void; onClose: () => void }) {
  const [flow] = useState<TreeFlow>("down");
  const canReal = Boolean(real && real.people.length >= 2);
  const [mine, setMine] = useState(true);
  const useReal = canReal && mine;
  const demo = useMemo(() => demoTree(), []);
  const data = useReal && real ? real : demo;
  const people = data.people;
  const unions = data.unions;
  const focusId = data.focusId;
  const layout = useMemo(() => schemeLayout(people, unions, focusId, flow), [people, unions, focusId, flow]);
  const poster = useMemo(() => (style === "carved" ? layoutPoster(people, unions, focusId, flow, schemeAnchor(people, unions, focusId, flow)) : null), [style, people, unions, focusId, flow]);
  const cameo = useMemo(() => (style === "cameo" ? layoutCameo(people, unions, focusId, flow, schemeAnchor(people, unions, focusId, flow)) : null), [style, people, unions, focusId, flow]);
  const gzhel = useMemo(() => (style === "gzhel" ? layoutGzhel(people, unions, focusId, flow, schemeAnchor(people, unions, focusId, flow)) : null), [style, people, unions, focusId, flow]);
  const boheme = useMemo(() => (style === "boheme" ? layoutBoheme(people, unions, focusId, flow, schemeAnchor(people, unions, focusId, flow)) : null), [style, people, unions, focusId, flow]);
  const taiga = useMemo(() => (style === "taiga" ? layoutTaiga(people, unions, focusId, flow, schemeAnchor(people, unions, focusId, flow)) : null), [style, people, unions, focusId, flow]);
  return (
    <Sheet title={`Так выглядит «${TITLE[style]}»`} onClose={onClose}>
      <div className="grid gap-3">
        <p className="text-sm text-muted">{useReal ? "Так стиль выглядит на вашем древе. Само древо не меняется." : "Это пример оформления. Ваше древо не меняется."} Выберите стиль, который нравится, и откройте его.</p>
        {canReal ? (
          <div className="flex gap-2" role="tablist">
            {([[true, "Моё древо"], [false, "Образец"]] as const).map(([value, text]) => (
              <button key={text} type="button" role="tab" aria-selected={mine === value} onClick={() => setMine(value)} className={`min-h-11 flex-1 rounded-full border px-3 text-sm font-semibold ${mine === value ? "border-moss bg-moss text-paper" : "border-ink/15 bg-white/70 text-ink"}`}>
                {text}
              </button>
            ))}
          </div>
        ) : null}
        {SAMPLE[style] && !useReal ? (
          <div className="max-h-[56dvh] overflow-auto rounded-2xl border border-line bg-black">
            <img src={`${import.meta.env.BASE_URL}${SAMPLE[style]}`} alt={`Образец стиля «${TITLE[style]}»`} className="block w-full" draggable={false} />
          </div>
        ) : null}
        <div className={`tree-root relative h-[52dvh] min-h-[22rem] overflow-hidden rounded-2xl border border-line${SAMPLE[style] && !useReal ? " hidden" : ""}`} data-theme="paper">
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
        onJump={() => undefined}
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
          <span className="pointer-events-none absolute left-3 top-3 z-30 rounded-full bg-black/55 px-3 py-1 text-xs font-semibold text-white">Предпросмотр</span>
        </div>
        <button type="button" className="min-h-12 rounded-full bg-moss px-5 text-sm font-semibold text-paper" onClick={onOpen}>
          Открыть стиль «{TITLE[style]}» в моём древе
        </button>
      </div>
    </Sheet>
  );
}
