import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/rod/config";
import { fetchInbox } from "@/lib/rod/family";
import { FamilySheet } from "@/components/rod/family-sheet";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { DOC_KINDS, EXAMPLE_TIMELINE } from "@/lib/rod/content";
import { maidenAllowed, personEvents } from "@/lib/rod/person";
import { EMPTY_PERSON, PersonAvatar, PersonEditor, PersonFields, type PersonDraft } from "@/components/rod/person-fields";
import { useRod } from "@/lib/rod/store";
import type { ArchiveTab } from "@/lib/rod/types";
import { cn } from "@/lib/cn";
import { TreePane } from "@/components/rod/family-tree";
import { Cut } from "@/components/rod/botanica";
import { MediaImg } from "@/components/rod/media-img";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

const TABS: { id: ArchiveTab; label: string }[] = [
  { id: "people", label: "Люди" },
  { id: "tree", label: "Древо" },
  { id: "time", label: "Лента" },
  { id: "photos", label: "Фото" },
  { id: "places", label: "Места" },
  { id: "docs", label: "Бумаги" },
];

/** Форма добавления свёрнута, пока в списке уже что-то есть: список главный, форма по кнопке. */
function AddFold({ label, empty, children }: { label: string; empty: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (empty || open) return <>{children}</>;
  return (
    <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-dashed border-moss/50 text-sm font-semibold text-moss">
      <Plus className="size-4" /> {label}
    </button>
  );
}

export function ArchiveScreen({ tab }: { tab: ArchiveTab }) {
  const nav = useNav();
  return (
    <ScreenFrame>
      <TopBar kicker="Архив семьи" title="Что уже собрано" onBack={nav.back} />
      <div className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto border-b border-ink/10">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => nav.replace({ id: "archive", tab: item.id })}
            className={cn(
              "min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold",
              tab === item.id ? "border-moss text-ink" : "border-transparent text-muted",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "people" ? <PeoplePane /> : null}
        {tab === "tree" ? <TreePane /> : null}
        {tab === "time" ? <TimePane /> : null}
        {tab === "photos" ? <PhotosPane /> : null}
        {tab === "places" ? <PlacesPane /> : null}
        {tab === "docs" ? <DocsPane /> : null}
      </div>
    </ScreenFrame>
  );
}

function FamilyCard() {
  const room = useRod((state) => state.room);
  const [open, setOpen] = useState(false);
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    if (!room || !API_BASE) return;
    void fetchInbox().then((items) => setWaiting(items.length)).catch(() => undefined);
  }, [room, open]);
  return (
    <>
      <button
        type="button"
        onClick={() => (API_BASE ? setOpen(true) : toast("Семейный доступ появится, когда подключится сервер приложения."))}
        className="glass flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Пригласить родственников</span>
          <span className="block text-sm text-muted">Пусть расскажут свои истории и пришлют фото. Уроки им не видны.</span>
        </span>
        {waiting > 0 ? <span className="grid min-w-7 place-items-center rounded-full bg-rose-deep px-2 py-1 text-xs font-semibold text-paper">{waiting}</span> : null}
      </button>
      {open ? <FamilySheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PeoplePane() {
  const people = useRod((state) => state.people);
  const addPerson = useRod((state) => state.addPerson);
  const [draft, setDraft] = useState<PersonDraft>(EMPTY_PERSON);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      <FamilyCard />
      <AddFold label="Добавить человека" empty={people.length === 0}>
        <form
          className="glass grid gap-3 rounded-2xl p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!draft.name.trim()) return;
            addPerson({ ...draft, name: draft.name.trim(), maidenName: maidenAllowed(draft) ? draft.maidenName.trim() : "", birthYear: draft.birthYear.trim(), parents: (draft.parents ?? []).filter(Boolean) });
            setDraft(EMPTY_PERSON);
            toast("Человек добавлен: он на ленте и в древе");
          }}
        >
          <PersonFields value={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} others={people} />
          <Button type="submit" disabled={!draft.name.trim()}>
            Добавить в семью
          </Button>
        </form>
      </AddFold>
      <ul className="grid gap-2">
        {people.map((person) => (
          <li key={person.id} className="glass rounded-2xl p-4">
            <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setOpenId((value) => (value === person.id ? null : person.id))}>
              <PersonAvatar person={person} size={48} />
              <span className="min-w-0">
                <span className="block text-lg font-semibold text-ink">{person.name}</span>
                <span className="block text-sm text-muted">
                  {person.relation}
                  {person.birthYear ? ` · ${person.birthYear}` : ""}
                  {person.deathYear ? ` – ${person.deathYear}` : ""}
                  {person.maidenName && maidenAllowed(person) ? ` · девичья ${person.maidenName}` : ""}
                </span>
              </span>
            </button>
            {openId === person.id ? (
              <div className="mt-3">
                <PersonEditor person={person} onRemoved={() => setOpenId(null)} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {people.length === 0 ? (
        <div className="flex items-center gap-4 border-t border-ink/10 pt-4">
          <Cut id="moss_archive" className="w-24 shrink-0 rotate-[-4deg]" />
          <p className="hand text-[1.5rem] leading-tight text-gold-ink">Пока никого нет. Начните с одного имени.</p>
        </div>
      ) : null}
    </div>
  );
}

function TimePane() {
  const events = useRod((state) => state.events);
  const addEvent = useRod((state) => state.addEvent);
  const removeEvent = useRod((state) => state.removeEvent);
  const [year, setYear] = useState("");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const people = useRod((state) => state.people);
  const auto = personEvents(people);
  const sorted = [...events.map((item) => ({ ...item, personId: "" })), ...auto].sort((a, b) => yearNum(a.year) - yearNum(b.year));
  const showingExample = sorted.length === 0;

  return (
    <div className="grid gap-4">
      <AddFold label="Добавить событие" empty={events.length === 0}>
      <form
        className="glass grid gap-3 rounded-2xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!year.trim() || !title.trim()) return;
          addEvent({ year: year.trim(), title: title.trim(), detail: detail.trim() });
          setYear("");
          setTitle("");
          setDetail("");
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <Field label="Год">
            <input className="field" value={year} onChange={(event) => setYear(event.target.value)} placeholder="1970" />
          </Field>
          <Field label="Событие">
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Свадьба бабушки и дедушки" />
          </Field>
        </div>
        <Field label="Деталь, если есть">
          <input className="field" value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Где, кто был рядом" />
        </Field>
        <Button type="submit" disabled={!year.trim() || !title.trim()}>
          Поставить на ленту
        </Button>
      </form>
      </AddFold>
      {showingExample ? (
        <p className="text-sm text-muted">Так может выглядеть лента. Это пример, не ваши даты – он исчезнет, когда появится первое событие.</p>
      ) : (
        <p className="text-sm text-muted">Ваша жизнь продолжает историю, которая началась задолго до вас.</p>
      )}
      <ol className="relative grid gap-0 border-l border-line pl-5">
        {(showingExample ? EXAMPLE_TIMELINE.map((item, index) => ({ ...item, id: `ex-${index}`, detail: "" })) : sorted).map((event) => (
          <li key={event.id} className="relative pb-5">
            <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-rose" />
            <p className="text-sm tabular-nums text-rose-deep">{event.year}</p>
            <p className="text-lg font-semibold text-ink">{event.title}</p>
            {event.detail ? <p className="text-sm text-muted">{event.detail}</p> : null}
            {!showingExample && !("personId" in event && event.personId) ? (
              <button type="button" className="mt-1 text-sm text-muted underline" onClick={() => removeEvent(event.id)}>
                Удалить
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function PhotosPane() {
  const nav = useNav();
  const photos = useRod((state) => state.photos);
  const removePhoto = useRod((state) => state.removePhoto);
  const [viewAt, setViewAt] = useState<number | null>(null);
  return (
    <div className="grid gap-3">
      <Button onClick={() => nav.go({ id: "photo-new" })}>Оцифровать фотографию</Button>
      {photos.length === 0 ? <p className="text-sm text-muted">Достаточно подписать, кто на снимке. Одной старой фотографии уже хватит для главы.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {photos.map((photo) => (
          <li key={photo.id} className="glass overflow-hidden rounded-2xl">
            <button type="button" className="block w-full" aria-label="Открыть фото" onClick={() => setViewAt(photos.indexOf(photo))}>
              <MediaImg src={photo.dataUrl} alt={photo.who || "Семейная фотография"} className="aspect-[4/3] w-full object-cover" />
            </button>
            <div className="p-4">
              <p className="font-medium text-ink">{photo.who || "Без подписи"}</p>
              <p className="text-sm text-muted">
                {[photo.where, photo.year].filter(Boolean).join(" · ")}
              </p>
              {photo.what ? <p className="mt-2 text-sm text-ink">{photo.what}</p> : null}
              {photo.photographer ? <p className="mt-1 text-sm text-muted">Снимал: {photo.photographer}</p> : null}
              <button type="button" className="mt-2 text-sm text-muted underline" onClick={() => removePhoto(photo.id)}>
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
      {viewAt !== null ? <PhotoViewer photos={photos} start={viewAt} onClose={() => setViewAt(null)} /> : null}
    </div>
  );
}

function PlacesPane() {
  const places = useRod((state) => state.places);
  const addPlace = useRod((state) => state.addPlace);
  const removePlace = useRod((state) => state.removePlace);
  const [name, setName] = useState("");
  const [years, setYears] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-3">
      <AddFold label="Добавить место" empty={places.length === 0}>
      <form
        className="glass grid gap-3 rounded-2xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          addPlace({ name: name.trim(), years: years.trim(), note: note.trim() });
          setName("");
          setYears("");
          setNote("");
        }}
      >
        <Field label="Место">
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Дом, двор, город, дорога" />
        </Field>
        <Field label="Годы">
          <input className="field" value={years} onChange={(event) => setYears(event.target.value)} placeholder="до 1978" />
        </Field>
        <Field label="Что там было">
          <textarea className="field min-h-20" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
        <Button type="submit" disabled={!name.trim()}>
          Сохранить место
        </Button>
      </form>
      </AddFold>
      <ul className="grid gap-2">
        {places.map((place) => (
          <li key={place.id} className="glass rounded-2xl p-4">
            <p className="text-lg font-semibold text-ink">{place.name}</p>
            {place.years ? <p className="text-sm text-rose-deep">{place.years}</p> : null}
            {place.note ? <p className="mt-1 text-sm text-muted">{place.note}</p> : null}
            <button type="button" className="mt-2 text-sm text-muted underline" onClick={() => removePlace(place.id)}>
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DocsPane() {
  const documents = useRod((state) => state.documents);
  const addDocument = useRod((state) => state.addDocument);
  const removeDocument = useRod((state) => state.removeDocument);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState(DOC_KINDS[0] ?? "другое");
  const [year, setYear] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-3">
      <AddFold label="Добавить бумагу" empty={documents.length === 0}>
      <form
        className="glass grid gap-3 rounded-2xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!title.trim()) return;
          addDocument({ title: title.trim(), kind, year: year.trim(), note: note.trim() });
          setTitle("");
          setYear("");
          setNote("");
        }}
      >
        <p className="text-sm text-muted">Не обязательно сканировать. Достаточно названия и у кого бумага лежит.</p>
        <Field label="Документ">
          <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Свидетельство о браке бабушки" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Какой">
            <select className="field" value={kind} onChange={(event) => setKind(event.target.value)}>
              {DOC_KINDS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label="Год">
            <input className="field" value={year} onChange={(event) => setYear(event.target.value)} />
          </Field>
        </div>
        <Field label="Где лежит">
          <input className="field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="У мамы, в синей коробке" />
        </Field>
        <Button type="submit" disabled={!title.trim()}>
          Записать документ
        </Button>
      </form>
      </AddFold>
      <ul className="grid gap-2">
        {documents.map((doc) => (
          <li key={doc.id} className="glass rounded-2xl p-4">
            <p className="font-medium text-ink">{doc.title}</p>
            <p className="text-sm text-muted">
              {doc.kind}
              {doc.year ? ` · ${doc.year}` : ""}
              {doc.note ? ` · ${doc.note}` : ""}
            </p>
            <button type="button" className="mt-2 text-sm text-muted underline" onClick={() => removeDocument(doc.id)}>
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function yearNum(value: string): number {
  const match = value.match(/\d{3,4}/);
  return match ? Number(match[0]) : 9999;
}

/** Просмотр: стрелки, свайп и клавиши листают всю галерею, не закрывая фото. */
function PhotoViewer({ photos, start, onClose }: { photos: { id: string; dataUrl: string; who: string; where: string; year: string; what: string }[]; start: number; onClose: () => void }) {
  const [at, setAt] = useState(Math.min(start, photos.length - 1));
  const touch = useRef<number | null>(null);
  const go = (dir: number) => setAt((value) => (value + dir + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") go(-1);
      else if (event.key === "ArrowRight") go(1);
      else if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const photo = photos[at];
  if (!photo) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-night/95 text-paper"
      onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const from = touch.current;
        touch.current = null;
        const to = event.changedTouches[0]?.clientX;
        if (from === null || to === undefined || Math.abs(to - from) < 50) return;
        go(to < from ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span className="text-sm tabular-nums text-paper/80">{at + 1} из {photos.length}</span>
        <button type="button" aria-label="Закрыть" className="grid size-11 place-items-center rounded-full bg-paper/10" onClick={onClose}>
          <X className="size-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <MediaImg src={photo.dataUrl} alt={photo.who || "Семейная фотография"} className="max-h-full max-w-full object-contain" />
        {photos.length > 1 ? (
          <>
            <button type="button" aria-label="Предыдущее фото" className="absolute left-2 grid size-12 place-items-center rounded-full bg-night/60" onClick={() => go(-1)}>
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" aria-label="Следующее фото" className="absolute right-2 grid size-12 place-items-center rounded-full bg-night/60" onClick={() => go(1)}>
              <ChevronRight className="size-6" />
            </button>
          </>
        ) : null}
      </div>
      <div className="px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-center">
        <p className="font-semibold">{photo.who || "Без подписи"}</p>
        <p className="text-sm text-paper/70">{[photo.where, photo.year].filter(Boolean).join(" · ")}</p>
        {photo.what ? <p className="mt-1 text-sm text-paper/85">{photo.what}</p> : null}
      </div>
    </div>
  );
}
