import { useMemo, useState } from "react";
import { LocateFixed, Search, X } from "lucide-react";
import { displayName, yearsOf } from "@/lib/tree/kinship";
import { centerCandidates, relationCard, relationsFrom } from "@/lib/tree/recenter";
import { useTree } from "@/lib/tree/ui-store";

/**
 * Выбор центра дерева: поиск и алфавитный список всех людей книги.
 * Выбор меняет только то, от кого строится схема и считается родство; записи людей не трогаются.
 */
export function CenterPicker() {
  const people = useTree((s) => s.people);
  const unions = useTree((s) => s.unions);
  const focusId = useTree((s) => s.focusId);
  const homeId = useTree((s) => s.homeId);
  const setFocus = useTree((s) => s.setFocus);
  const resetFocus = useTree((s) => s.resetFocus);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rels = useMemo(() => (open ? relationsFrom(people, unions, focusId, homeId) : null), [open, people, unions, focusId, homeId]);
  const list = useMemo(() => (open ? centerCandidates(people, query) : []), [open, people, query]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  if (!open) {
    return (
      <button type="button" className="chip" aria-label="Выбрать центр дерева" onClick={() => setOpen(true)}>
        <LocateFixed className="size-5" />
        Показать меня
      </button>
    );
  }
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-canvas/95 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-fg backdrop-blur-md" role="dialog" aria-label="Выбрать центр дерева">
      <div className="flex items-center gap-2">
        <label className="chip !flex min-w-0 flex-1 gap-2">
          <Search className="size-5 shrink-0" />
          <input
            autoFocus
            value={query}
            placeholder="Имя или фамилия"
            className="min-w-0 flex-1 bg-transparent outline-none"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key === "Enter" && list[0]) {
                setFocus(list[0].id);
                close();
              }
            }}
          />
        </label>
        <button type="button" className="chip" aria-label="Закрыть выбор центра" onClick={close}>
          <X className="size-5" />
        </button>
      </div>
      <p className="mt-2 text-sm text-fg-soft">Выберите человека: дерево и родство пересчитаются от него. Записи в книге не изменятся.</p>
      {focusId !== homeId && (
        <button
          type="button"
          className="chip mt-2 w-full justify-center !bg-gold !text-ink"
          onClick={() => {
            resetFocus();
            close();
          }}
        >
          Вернуться к исходному дереву
        </button>
      )}
      <ul className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-3xl bg-white/90 p-2 text-ink">
        {list.length ? (
          list.map((person) => {
            const rel = rels?.get(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  aria-current={person.id === focusId}
                  className={`flex min-h-12 w-full flex-col rounded-2xl px-3 py-2 text-left hover:bg-white ${person.id === focusId ? "bg-gold/30" : ""}`}
                  onClick={() => {
                    setFocus(person.id);
                    close();
                  }}
                >
                  <span className="truncate font-serif text-lg leading-tight">{displayName(person)}</span>
                  <span className="truncate text-sm text-muted">
                    {rel ? relationCard(rel) : ""} · {yearsOf(person)}
                  </span>
                </button>
              </li>
            );
          })
        ) : (
          <li className="px-3 py-3 text-sm text-muted">Никого не нашла. Попробуйте начало имени или фамилии.</li>
        )}
      </ul>
    </div>
  );
}
