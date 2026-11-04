import { useEffect, useMemo, useState } from "react";
import { loadShared } from "@/lib/rod/share-tree";
import { TreeStage } from "@/components/tree/TreeStage";
import { displayName, kinship, yearsOf } from "@/lib/tree/kinship";
import { layoutTree } from "@/lib/tree/layout";
import type { TreeData } from "@/lib/tree/types";

/** Просмотр древа по ссылке от родственника: только смотреть, ничего не менять и не сохранять в свою книгу. */
export function TreeViewScreen({ id }: { id: string }) {
  const [tree, setTree] = useState<TreeData | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [centerReq, setCenterReq] = useState<{ id: string; n: number } | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [flow, setFlow] = useState<"down" | "up">("down");

  useEffect(() => {
    let alive = true;
    loadShared(id)
      .then((data) => alive && setTree(data))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const layout = useMemo(() => (tree ? layoutTree(tree.people, tree.unions, tree.focusId, flow) : null), [tree, flow]);
  const person = tree?.people.find((p) => p.id === selected) ?? null;

  if (error) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6 text-center text-fg">
        <div>
          <h1 className="text-xl font-semibold">Древо не открылось</h1>
          <p className="mt-2 text-sm opacity-80">{error}</p>
        </div>
      </main>
    );
  }
  if (!tree || !layout) return <main className="grid min-h-dvh place-items-center bg-canvas text-fg">Открываем древо…</main>;

  return (
    <main data-theme="paper" className="tree-root fixed inset-0 z-40 overflow-hidden bg-canvas text-fg">
      <header className="pointer-events-none absolute left-3 right-3 top-3 z-20 flex items-start justify-between gap-2">
        <span className="chip pointer-events-auto">Древо рода: только просмотр</span>
      </header>
      <TreeStage
        layout={layout}
        people={tree.people}
        unions={tree.unions}
        focusId={tree.focusId}
        selectedId={selected}
        centerReq={centerReq}
        fitReq={0}
        radius={radius}
        onRadius={(next) => {
          setRadius(next);
          setCenterReq({ id: tree.focusId, n: Date.now() });
        }}
        onSelectPerson={(pid) => setSelected(pid)}
        onSelectUnion={() => setSelected(null)}
        onClear={() => setSelected(null)}
        onLocate={() => setCenterReq({ id: tree.focusId, n: Date.now() })}
        onJump={(pid) => setCenterReq({ id: pid, n: Date.now() })}
        style="work"
        onStyle={() => undefined}
        stylesLocked
        poster={null}
        cameo={null}
        gzhel={null}
        boheme={null}
        taiga={null}
        flow={flow}
        onFlow={setFlow}
      />
      {person ? (
        <aside className="absolute bottom-24 left-3 right-3 z-30 mx-auto max-w-md rounded-2xl bg-white/95 p-4 text-ink shadow-lg">
          <button type="button" aria-label="Закрыть" className="float-right min-h-11 min-w-11 text-xl" onClick={() => setSelected(null)}>
            ×
          </button>
          <p className="text-lg font-semibold">{displayName(person)}</p>
          <p className="text-sm text-muted">
            {kinship(tree.people, tree.unions, tree.focusId, person.id).card} · {yearsOf(person)}
          </p>
          {person.birthPlace ? <p className="mt-1 text-sm">Место рождения: {person.birthPlace}</p> : null}
        </aside>
      ) : null}
    </main>
  );
}
