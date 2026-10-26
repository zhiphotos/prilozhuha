import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { displayName, kinship, yearsOf } from "@/lib/tree/kinship";
import { searchPeople } from "@/lib/tree/search";
import { useTree } from "@/lib/tree/ui-store";

/** Поиск по древу: набираешь буквы, внизу сразу подбираются люди, нажатие переносит к человеку. */
export function TreeSearch({ onJump }: { onJump: (id: string) => void }) {
  const people = useTree((s) => s.people);
  const unions = useTree((s) => s.unions);
  const focusId = useTree((s) => s.focusId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const found = useMemo(() => (open ? searchPeople(people, query, 8) : []), [open, people, query]);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  if (!open) {
    return (
      <button type="button" className="chip" aria-label="Найти человека в древе" onClick={() => setOpen(true)}>
        <Search className="size-5" />
      </button>
    );
  }
  return (
    <div className="relative w-full">
      <label className="chip !flex w-full gap-2">
        <Search className="size-5 shrink-0" />
        <input
          autoFocus
          value={query}
          placeholder="Имя, фамилия или год"
          className="min-w-0 flex-1 bg-transparent outline-none"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") close();
            if (event.key === "Enter" && found[0]) {
              onJump(found[0].id);
              close();
            }
          }}
        />
        <button type="button" aria-label="Закрыть поиск" onClick={close}>
          <X className="size-5" />
        </button>
      </label>
      {query.trim() ? (
        <ul className="sheet absolute inset-x-0 top-full z-30 mt-2 max-h-[50dvh] overflow-y-auto rounded-3xl p-2 text-ink">
          {found.length ? (
            found.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className="flex w-full flex-col rounded-2xl px-3 py-2 text-left hover:bg-white"
                  onClick={() => {
                    onJump(person.id);
                    close();
                  }}
                >
                  <span className="truncate font-serif text-lg leading-tight">{displayName(person)}</span>
                  <span className="truncate text-sm text-muted">
                    {kinship(people, unions, focusId, person.id).card} · {yearsOf(person)}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-muted">Никого не нашла. Попробуйте начало имени или фамилии.</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
