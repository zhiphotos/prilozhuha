import { useRef, useState } from "react";
import type { Confirmations, Needs } from "@/lib/tree/second-parent";
import { useTree, type Draft, type StoreSecond } from "@/lib/tree/ui-store";

/** Запись НОВОГО ребёнка: вызывает готовое действие 3а, показывает вопросы и ошибки. */
export function useChildSubmit(onCreated: (id: string) => void) {
  const [needs, setNeeds] = useState<Needs | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = useRef<{ from: string; kind: "son" | "daughter"; draft: Draft; second: StoreSecond; confirm: Confirmations } | null>(null);
  const run = async (from: string, kind: "son" | "daughter", draft: Draft, second: StoreSecond, confirm: Confirmations = {}) => {
    last.current = { from, kind, draft, second, confirm };
    setBusy(true);
    setError(null);
    const res = await useTree.getState().addChildWithParents(from, kind, draft, second, confirm);
    setBusy(false);
    if (res.ok) {
      setNeeds(null);
      onCreated(res.childId);
      return;
    }
    if (res.needs?.warnings || res.needs?.similar) {
      setNeeds(res.needs);
      return;
    }
    setNeeds(null);
    setError(res.errors.join(" ") || "Не получилось записать");
  };
  const confirm = (c: Confirmations) => {
    const l = last.current;
    if (l) void run(l.from, l.kind, l.draft, l.second, { ...l.confirm, ...c });
  };
  const reset = () => { setNeeds(null); setError(null); last.current = null; };
  return { run, confirm, needs, error, busy, reset };
}
