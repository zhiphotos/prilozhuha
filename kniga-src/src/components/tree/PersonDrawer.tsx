import { maskDate } from "@/lib/tree/date-input";
import { useMemo, useState } from "react";
import { AncestorGate } from "@/components/tree/AncestorGate";
import { familyOf, inflectSurname } from "@/lib/tree/fill";
import { displayName, kinship, yearsOf } from "@/lib/tree/kinship";
import { fileToPhoto } from "@/lib/tree/photo";
import { draftFrom, emptyDraft, useTree, type Draft, type RelKind } from "@/lib/tree/ui-store";
import type { Person, Union, UnionStatus } from "@/lib/tree/types";

const STATUSES: { id: UnionStatus; label: string }[] = [
  { id: "married", label: "Брак" },
  { id: "divorced", label: "Развод" },
  { id: "widowed", label: "Вдовство" },
  { id: "partner", label: "Союз" },
];

const ROLE: Record<RelKind, string> = {
  father: "Отец",
  mother: "Мать",
  spouse: "Супруг",
  son: "Ребёнок",
  daughter: "Ребёнок",
  brother: "Брат или сестра",
  sister: "Брат или сестра",
};

type Intent = { kind: RelKind; unionId?: string };

export function PersonDrawer({ onNewBook }: { onNewBook: () => void }) {
  const selectedId = useTree((s) => s.selectedId);
  const unionId = useTree((s) => s.unionId);
  const people = useTree((s) => s.people);
  const unions = useTree((s) => s.unions);
  const focusId = useTree((s) => s.focusId);
  const person = people.find((p) => p.id === selectedId) ?? null;
  const union = unions.find((u) => u.id === unionId) ?? null;

  if (!person && !union) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center md:p-4 lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[400px] lg:items-stretch">
      <section className="sheet pointer-events-auto max-h-[74dvh] w-full overflow-y-auto rounded-t-3xl px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:max-w-xl md:rounded-3xl lg:max-h-none lg:max-w-none">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-line lg:hidden" />
        {union && !person && <UnionEditor union={union} people={people} />}
        {person && <PersonBody key={person.id} person={person} people={people} unions={unions} focusId={focusId} onNewBook={onNewBook} />}
      </section>
    </div>
  );
}

function UnionEditor({ union, people }: { union: Union; people: Person[] }) {
  const setUnionStatus = useTree((s) => s.setUnionStatus);
  const selectUnion = useTree((s) => s.selectUnion);
  const selectPerson = useTree((s) => s.selectPerson);
  const names = union.partnerIds.map((id) => people.find((p) => p.id === id)).filter((p): p is Person => Boolean(p));
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-widest text-muted uppercase">Союз</p>
          <h2 className="font-serif text-3xl leading-tight">{names.map((p) => p.firstName).join(" и ") || "Семья"}</h2>
        </div>
        <button type="button" className="chip !bg-sheet !text-ink" onClick={() => selectUnion(null)}>
          Закрыть
        </button>
      </header>
      <p className="text-sm text-muted">Супруги стоят рядом. Дети этой семьи спускаются от середины линии.</p>
      <div className="grid grid-cols-2 gap-2">
        {names.map((p) => (
          <button key={p.id} type="button" className="min-h-12 rounded-2xl border border-line bg-white px-3 text-left font-serif text-xl" onClick={() => selectPerson(p.id)}>
            {displayName(p)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STATUSES.map((item) => (
          <button key={item.id} type="button" className={`min-h-11 rounded-2xl border px-3 text-sm font-semibold ${union.status === item.id ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`} onClick={() => setUnionStatus(union.id, item.id)}>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PersonBody({ person, people, unions, focusId, onNewBook }: { person: Person; people: Person[]; unions: Union[]; focusId: string; onNewBook: () => void }) {
  const [mode, setMode] = useState<"view" | "edit" | "add">("view");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [search, setSearch] = useState(false);
  const selectPerson = useTree((s) => s.selectPerson);
  const kin = kinship(people, unions, focusId, person.id);
  const family = useMemo(() => familyOf(people, unions, person.id), [people, unions, person.id]);

  const start = (kind: RelKind, unionId?: string) => {
    setIntent({ kind, unionId });
    setMode("add");
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start gap-4">
        <Portrait person={person} />
        <div className="min-w-0 flex-1">
          <p className="text-xs tracking-widest text-role uppercase">{kin.card}</p>
          <h2 className="font-serif text-3xl leading-none">{displayName(person, "full")}</h2>
          <p className="mt-1 text-sm text-muted">
            {yearsOf(person)}
            {kin.degree != null && kin.kind !== "self" ? ` · ${kin.degree} колено` : ""}
          </p>
        </div>
        <button type="button" className="chip !bg-sheet !text-ink shrink-0" onClick={() => selectPerson(null)}>
          Закрыть
        </button>
      </header>
      {mode === "view" && (
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          Дата рождения
          <input
            inputMode="decimal"
            maxLength={10}
            placeholder="год или 12.03.1891"
            value={maskDate(person.birthYear)}
            onChange={(e) => useTree.getState().updatePerson(person.id, { ...draftFrom(person), birthYear: maskDate(e.target.value) })}
          />
        </label>
        <label className="field">
          Дата смерти
          <input
            inputMode="decimal"
            maxLength={10}
            placeholder="год или 04.11.1968"
            value={maskDate(person.deathYear)}
            onChange={(e) => useTree.getState().updatePerson(person.id, { ...draftFrom(person), deathYear: maskDate(e.target.value) })}
          />
        </label>
      </div>
      )}

      {mode === "view" && <FamilySheet person={person} family={family} people={people} unions={unions} focusId={focusId} onEdit={() => setMode("edit")} onAdd={start} onNewBook={onNewBook} onSearch={() => setSearch(true)} />}
      {mode === "edit" && (
        <PersonForm
          initial={draftFrom(person)}
          submitLabel="Сохранить"
          onCancel={() => setMode("view")}
          onSubmit={(draft) => {
            useTree.getState().updatePerson(person.id, draft);
            setMode("view");
          }}
        />
      )}
      {mode === "add" && intent && (
        <AddRelative person={person} people={people} unions={unions} intent={intent} onCancel={() => setMode("view")} />
      )}
      {search && <AncestorGate person={person} onClose={() => setSearch(false)} />}
    </div>
  );
}

function FamilySheet({
  person,
  family,
  people,
  unions,
  focusId,
  onEdit,
  onAdd,
  onNewBook,
  onSearch,
}: {
  person: Person;
  family: ReturnType<typeof familyOf>;
  people: Person[];
  unions: Union[];
  focusId: string;
  onEdit: () => void;
  onAdd: (kind: RelKind, unionId?: string) => void;
  onNewBook: () => void;
  onSearch: () => void;
}) {
  const setFocus = useTree((s) => s.setFocus);
  const removePerson = useTree((s) => s.removePerson);
  const setUnionStatus = useTree((s) => s.setUnionStatus);
  const setUnionYears = useTree((s) => s.setUnionYears);
  const selectPerson = useTree((s) => s.selectPerson);
  const flipSpouse = useTree((s) => s.flipSpouse);
  const moveBranch = useTree((s) => s.moveBranch);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      {person.note && <p className="text-base leading-relaxed">{person.note}</p>}
      <p className="text-sm text-muted">Нового человека добавляют к этому: нажмите, кем он приходится. Предка по архивам ищут отдельно: фамилия сама по себе ничего не доказывает.</p>
      <button type="button" className="min-h-12 rounded-2xl bg-gold px-3 text-sm font-semibold text-ink" onClick={onSearch}>
        Искать предков
      </button>
      <div className="grid grid-cols-2 gap-2">
        {!family.father && (
          <button type="button" className="min-h-12 rounded-2xl bg-ink px-3 text-sm font-semibold text-sheet" onClick={() => onAdd("father")}>
            Добавить отца
          </button>
        )}
        {!family.mother && (
          <button type="button" className="min-h-12 rounded-2xl bg-ink px-3 text-sm font-semibold text-sheet" onClick={() => onAdd("mother")}>
            Добавить мать
          </button>
        )}
        <button type="button" className="min-h-12 rounded-2xl bg-ink px-3 text-sm font-semibold text-sheet" onClick={() => onAdd("spouse")}>
          Добавить супруга
        </button>
        <button
          type="button"
          className="min-h-12 rounded-2xl bg-ink px-3 text-sm font-semibold text-sheet"
          onClick={() => onAdd("son", family.marriages.length === 1 ? family.marriages[0]!.union.id : undefined)}
        >
          Добавить ребёнка
        </button>
        <button type="button" className="min-h-12 rounded-2xl border border-line bg-white px-3 text-sm font-semibold" onClick={() => onAdd("brother")}>
          Добавить брата или сестру
        </button>
      </div>
      <section className="flex flex-col gap-2">
        <p className="text-xs tracking-widest text-muted uppercase">Расположение на схеме</p>
        <p className="text-sm text-muted">Схема раскладывает людей сама. Здесь можно выбрать порядок: поменять супругов местами или сдвинуть всю ветку левее или правее. Если ветки сплетаются, откройте шестерёнку, затем «Расширенные», и разведите их шире.</p>
        <div className="grid grid-cols-2 gap-2">
          {family.marriages.length > 0 && (
            <button type="button" className="col-span-2 min-h-12 rounded-2xl border border-line bg-white px-3 text-sm font-semibold" onClick={() => flipSpouse(person.id)}>
              Поменять с супругом местами
            </button>
          )}
          <button type="button" className="min-h-12 rounded-2xl border border-line bg-white px-3 text-sm font-semibold" onClick={() => moveBranch(person.id, -1)}>
            ← Ветку левее
          </button>
          <button type="button" className="min-h-12 rounded-2xl border border-line bg-white px-3 text-sm font-semibold" onClick={() => moveBranch(person.id, 1)}>
            Ветку правее →
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <p className="text-xs tracking-widest text-muted uppercase">Родители</p>
        <div className="grid grid-cols-2 gap-2">
          <KinSlot title="Отец" person={family.father} people={people} unions={unions} focusId={focusId} onOpen={selectPerson} onAdd={() => onAdd("father")} />
          <KinSlot title="Мать" person={family.mother} people={people} unions={unions} focusId={focusId} onOpen={selectPerson} onAdd={() => onAdd("mother")} />
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <p className="text-xs tracking-widest text-muted uppercase">Семьи</p>
        <p className="text-sm text-muted">Супруг встаёт рядом. Дети — под линией этого брака, не вперемешку с чужими.</p>
        {family.marriages.map(({ union, spouse, children }) => (
          <div key={union.id} className="rounded-2xl border border-line bg-white p-3">
            {spouse ? (
              <button type="button" className="w-full text-left" onClick={() => selectPerson(spouse.id)}>
                <span className="block font-serif text-2xl leading-tight">{displayName(spouse)}</span>
                <span className="text-sm text-muted">{kinship(people, unions, focusId, spouse.id).card}</span>
              </button>
            ) : (
              <p className="font-serif text-2xl">Без второго супруга</p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {STATUSES.map((item) => (
                <button key={item.id} type="button" className={`min-h-10 rounded-full px-3 text-sm ${union.status === item.id ? "bg-ink text-sheet" : "bg-sheet"}`} onClick={() => setUnionStatus(union.id, item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="field">
                Год брака
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={union.startYear}
                  onChange={(e) => setUnionYears(union.id, e.target.value, union.endYear)}
                />
              </label>
              <label className="field">
                Год конца
                <input
                  inputMode="numeric"
                  maxLength={4}
                  value={union.endYear}
                  onChange={(e) => setUnionYears(union.id, union.startYear, e.target.value)}
                />
              </label>
            </div>
            <p className="mt-3 text-xs tracking-widest text-muted uppercase">Дети</p>
            <div className="mt-2 flex flex-col gap-1">
              {children.map((child) => (
                <button key={child.id} type="button" className="min-h-11 rounded-xl px-2 text-left hover:bg-sheet" onClick={() => selectPerson(child.id)}>
                  <span className="font-serif text-xl">{displayName(child)}</span>
                  <span className="ml-2 text-sm text-muted">{kinship(people, unions, focusId, child.id).card}</span>
                </button>
              ))}
              <button type="button" className="min-h-11 rounded-xl border border-dashed border-line text-sm font-semibold" onClick={() => onAdd("son", union.id)}>
                Добавить ребёнка
              </button>
            </div>
          </div>
        ))}
        <button type="button" className="min-h-12 rounded-2xl border border-dashed border-line bg-white text-sm font-semibold" onClick={() => onAdd("spouse")}>
          {family.marriages.length ? "Ещё брак" : "Добавить супруга"}
        </button>
        {family.marriages.length === 0 && (
          <button type="button" className="min-h-12 rounded-2xl border border-dashed border-line bg-white text-sm font-semibold" onClick={() => onAdd("son")}>
            Ребёнок без второго родителя
          </button>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <p className="text-xs tracking-widest text-muted uppercase">Братья и сёстры</p>
        {family.siblings.map((sib) => (
          <button key={sib.id} type="button" className="min-h-12 rounded-2xl border border-line bg-white px-3 text-left" onClick={() => selectPerson(sib.id)}>
            <span className="font-serif text-xl">{displayName(sib)}</span>
            <span className="ml-2 text-sm text-muted">{kinship(people, unions, focusId, sib.id).card}</span>
          </button>
        ))}
        <button type="button" className="min-h-12 rounded-2xl border border-dashed border-line bg-white text-sm font-semibold" onClick={() => onAdd("brother")}>
          Добавить брата или сестру
        </button>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="min-h-11 rounded-2xl border border-line bg-white px-3 text-sm font-semibold" onClick={onEdit}>
          Править карточку
        </button>
        <button type="button" className="min-h-11 rounded-2xl border border-line bg-white px-3 text-sm font-semibold" onClick={() => setFocus(person.id)} disabled={focusId === person.id}>
          {focusId === person.id ? "Родство отсюда" : "Считать родство отсюда"}
        </button>
        {confirm ? (
          <button type="button" className="col-span-2 min-h-11 rounded-2xl bg-rose px-3 text-sm font-semibold text-ink" onClick={() => removePerson(person.id)}>
            Удалить навсегда
          </button>
        ) : (
          <button type="button" className="col-span-2 min-h-11 rounded-2xl border border-line bg-white px-3 text-sm font-semibold" onClick={() => setConfirm(true)}>
            Удалить из древа
          </button>
        )}
      </div>
    </>
  );
}

function KinSlot({
  title,
  person,
  people,
  unions,
  focusId,
  onOpen,
  onAdd,
}: {
  title: string;
  person?: Person;
  people: Person[];
  unions: Union[];
  focusId: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  if (!person) {
    return (
      <button type="button" className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-dashed border-line bg-white px-3 py-3 text-left" onClick={onAdd}>
        <span className="text-xs tracking-widest text-muted uppercase">{title}</span>
        <span className="font-serif text-2xl">Добавить</span>
      </button>
    );
  }
  const kin = kinship(people, unions, focusId, person.id);
  return (
    <button type="button" className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-line bg-white px-3 py-3 text-left" onClick={() => onOpen(person.id)}>
      <span className="text-xs tracking-widest text-muted uppercase">{title}</span>
      <span className="w-full truncate font-serif text-2xl leading-tight">{displayName(person)}</span>
      <span className="text-sm text-muted">{kin.card}</span>
    </button>
  );
}

function AddRelative({
  person,
  people,
  unions,
  intent,
  onCancel,
}: {
  person: Person;
  people: Person[];
  unions: Union[];
  intent: Intent;
  onCancel: () => void;
}) {
  const [unionId, setUnionId] = useState(intent.unionId ?? "");
  const [error, setError] = useState<string | null>(null);
  const mine = unions.filter((u) => u.partnerIds.includes(person.id));
  const needsChoice = (intent.kind === "son" || intent.kind === "daughter") && mine.length > 1 && !intent.unionId;
  const chosenUnion = intent.unionId || unionId || undefined;
  const [link, setLink] = useState(false);
  const [query, setQuery] = useState("");
  const [startYear, setStartYear] = useState("");
  const [status, setStatus] = useState<UnionStatus>("married");
  const flexible = intent.kind === "son" || intent.kind === "brother" || intent.kind === "spouse";
  const gender: Draft["gender"] =
    intent.kind === "father" ? "m" : intent.kind === "mother" ? "f" : flexible ? "u" : person.gender === "m" ? "f" : "m";
  const inherited =
    intent.kind === "spouse" ? "" : inflectSurname(person.lastName, gender === "u" ? person.gender : gender);
  const q = query.trim().toLowerCase();
  const candidates = people.filter((p) => {
    if (p.id === person.id) return false;
    const name = `${p.firstName} ${p.patronymic} ${p.lastName}`.toLowerCase();
    return !q || name.includes(q);
  });

  const resolveKind = (draftGender: Draft["gender"]): RelKind => {
    if (intent.kind === "son" || intent.kind === "daughter") return draftGender === "f" ? "daughter" : "son";
    if (intent.kind === "brother" || intent.kind === "sister") return draftGender === "f" ? "sister" : "brother";
    return intent.kind;
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="font-serif text-2xl leading-none">{ROLE[intent.kind]}</p>
      <p className="text-sm text-muted">К {displayName(person)}. Можно записать нового или выбрать того, кто уже есть в древе.</p>
      {needsChoice && (
        <div className="flex flex-col gap-2">
          <p className="text-xs tracking-widest text-muted uppercase">В какой семье ребёнок</p>
          {mine.map((union) => {
            const spouse = union.partnerIds.map((id) => people.find((p) => p.id === id)).find((p) => p && p.id !== person.id);
            return (
              <button key={union.id} type="button" className={`min-h-12 rounded-2xl border px-3 text-left ${unionId === union.id ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`} onClick={() => setUnionId(union.id)}>
                {spouse ? `С ${displayName(spouse)}` : "Без супруга"}
              </button>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`min-h-11 rounded-2xl border ${!link ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`} onClick={() => setLink(false)}>
          Новый человек
        </button>
        <button type="button" className={`min-h-11 rounded-2xl border ${link ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`} onClick={() => setLink(true)}>
          Уже в древе
        </button>
      </div>
      {intent.kind === "spouse" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="field col-span-2">
            Год брака
            <input inputMode="numeric" maxLength={4} value={startYear} onChange={(e) => setStartYear(e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </label>
          {STATUSES.map((item) => (
            <button key={item.id} type="button" className={`min-h-11 rounded-2xl border text-sm ${status === item.id ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`} onClick={() => setStatus(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
      {link ? (
        <div className="flex flex-col gap-2">
          <label className="field">
            Найти
            <input value={query} placeholder="Имя" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {candidates.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="min-h-12 rounded-2xl border border-line bg-white px-3 text-left"
                onClick={() => {
                  const kind = resolveKind(candidate.gender);
                  if ((intent.kind === "son" || intent.kind === "brother") && candidate.gender === "u") {
                    setError("Сначала укажите пол в карточке этого человека");
                    return;
                  }
                  if (needsChoice && !chosenUnion) {
                    setError("Выберите, в какой семье ребёнок");
                    return;
                  }
                  const message = useTree.getState().attachRelative(person.id, kind, candidate.id, chosenUnion, { startYear, status });
                  setError(message);
                }}
              >
                <span className="font-serif text-xl">{displayName(candidate)}</span>
                <span className="ml-2 text-sm text-muted">{kinship(people, unions, useTree.getState().focusId, candidate.id).card}</span>
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-role">{error}</p>}
          <button type="button" className="min-h-11 text-sm text-muted" onClick={onCancel}>
            Назад
          </button>
        </div>
      ) : (
        <PersonForm
          initial={{ ...emptyDraft(gender), lastName: inherited }}
          lockGender={intent.kind === "father" || intent.kind === "mother"}
          submitLabel="Положить в древо"
          error={error}
          onCancel={onCancel}
          onSubmit={(draft) => {
            if (flexible && intent.kind !== "spouse" && draft.gender === "u") {
              setError("Укажите, мужчина это или женщина");
              return;
            }
            if (needsChoice && !chosenUnion) {
              setError("Выберите, в какой семье ребёнок");
              return;
            }
            const kind = resolveKind(draft.gender);
            const message = useTree.getState().addRelative(person.id, kind, draft, chosenUnion, { startYear, status });
            setError(message);
          }}
        />
      )}
    </div>
  );
}

function PersonForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  lockGender = false,
  error,
}: {
  initial: Draft;
  submitLabel: string;
  onSubmit: (draft: Draft) => void;
  onCancel: () => void;
  lockGender?: boolean;
  error?: string | null;
}) {
  const [draft, setDraft] = useState(initial);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(draft);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="field">
          Имя
          <input value={draft.firstName} onChange={(e) => set({ firstName: e.target.value })} required />
        </label>
        <label className="field">
          Отчество
          <input value={draft.patronymic} onChange={(e) => set({ patronymic: e.target.value })} />
        </label>
        <label className="field col-span-2">
          Фамилия
          <input value={draft.lastName} onChange={(e) => set({ lastName: e.target.value })} />
        </label>
        {draft.gender !== "m" ? (
          <label className="field col-span-2">
            Девичья фамилия
            <input value={draft.maidenName ?? ""} placeholder="Если менялась" onChange={(e) => set({ maidenName: e.target.value })} />
          </label>
        ) : null}
        <label className="field">
          Дата рождения
          <input inputMode="decimal" maxLength={10} placeholder="год или 12.03.1891" value={draft.birthYear} onChange={(e) => set({ birthYear: maskDate(e.target.value) })} />
        </label>
        <label className="field">
          Дата смерти
          <input inputMode="decimal" maxLength={10} placeholder="год или 04.11.1968" value={draft.deathYear} onChange={(e) => set({ deathYear: maskDate(e.target.value) })} />
        </label>
      </div>
      {!lockGender && (
        <div className="grid grid-cols-3 gap-2">
          {(["f", "m", "u"] as const).map((g) => (
            <button key={g} type="button" className={`min-h-11 rounded-2xl border ${draft.gender === g ? "border-ink bg-ink text-sheet" : "border-line bg-white"}`} onClick={() => set({ gender: g })}>
              {g === "f" ? "Женщина" : g === "m" ? "Мужчина" : "Не указан"}
            </button>
          ))}
        </div>
      )}
      <label className="field">
        Заметка
        <textarea value={draft.note} onChange={(e) => set({ note: e.target.value })} />
      </label>
      <label className="field">
        Фото
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            set({ photo: await fileToPhoto(file) });
          }}
        />
      </label>
      {error && <p className="text-sm text-role">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="min-h-11 rounded-2xl border border-line" onClick={onCancel}>
          Отмена
        </button>
        <button type="submit" className="min-h-11 rounded-2xl bg-ink font-semibold text-sheet">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Portrait({ person }: { person: Person }) {
  const [broken, setBroken] = useState(false);
  const initials = `${person.firstName[0] ?? ""}${person.lastName[0] ?? ""}`;
  return (
    <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-[#d7c3a4] font-serif text-2xl">
      {person.photo && !broken ? <img src={person.photo} alt="" className="size-full object-cover" onError={() => setBroken(true)} /> : initials}
    </div>
  );
}
