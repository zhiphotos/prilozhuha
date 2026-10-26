import { PaySheet } from "@/components/rod/lessons";
import { AncestorSearch, type FoundRecord } from "@/components/tree/AncestorSearch";
import { searchesLeft } from "@/lib/rod/search-limit";
import { useRod } from "@/lib/rod/store";
import { emptyDraft, useTree } from "@/lib/tree/ui-store";
import type { Person } from "@/lib/tree/types";

/** Поиск по архивам только для платных, 10 запросов в месяц. Найденная запись попадает в «Люди» и в древо. */
export function AncestorGate({ person, onClose }: { person: Person; onClose: () => void }) {
  const programOpen = useRod((s) => s.programOpen);
  const usage = useRod((s) => s.searchUsage);
  const spendSearch = useRod((s) => s.spendSearch);
  if (!programOpen) return <PaySheet onClose={onClose} />;
  const plant = (found: FoundRecord) => {
    const parts = found.name.split(/\s+/).filter(Boolean);
    const draft = emptyDraft(found.role === "mother" ? "f" : found.role === "father" ? "m" : "u");
    draft.lastName = parts[0] ?? person.lastName;
    draft.firstName = parts[1] ?? "";
    draft.patronymic = parts.slice(2).join(" ");
    draft.birthYear = found.years;
    draft.note = found.note;
    const kind = found.role === "brother" ? "brother" : found.role;
    const message = useTree.getState().addRelative(person.id, kind, draft);
    if (!message) onClose();
  };
  return <AncestorSearch person={person} left={searchesLeft(usage)} onSpend={spendSearch} onPlant={plant} onClose={onClose} />;
}
