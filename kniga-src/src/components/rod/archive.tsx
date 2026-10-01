import { useState } from "react";
import { toast } from "sonner";
import { DOC_KINDS, EXAMPLE_TIMELINE, RELATIONS } from "@/lib/rod/content";
import { useRod } from "@/lib/rod/store";
import type { ArchiveTab } from "@/lib/rod/types";
import { cn } from "@/lib/cn";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

const TABS: { id: ArchiveTab; label: string }[] = [
  { id: "people", label: "Люди" },
  { id: "time", label: "Лента" },
  { id: "photos", label: "Фото" },
  { id: "places", label: "Места" },
  { id: "docs", label: "Бумаги" },
];

export function ArchiveScreen({ tab }: { tab: ArchiveTab }) {
  const nav = useNav();
  return (
    <ScreenFrame>
      <TopBar kicker="Архив" title="Что уже собрано" />
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => nav.tab({ id: "archive", tab: item.id })}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-medium",
              tab === item.id ? "bg-night text-paper" : "glass text-ink",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === "people" ? <PeoplePane /> : null}
        {tab === "time" ? <TimePane /> : null}
        {tab === "photos" ? <PhotosPane /> : null}
        {tab === "places" ? <PlacesPane /> : null}
        {tab === "docs" ? <DocsPane /> : null}
      </div>
    </ScreenFrame>
  );
}

function PeoplePane() {
  const people = useRod((state) => state.people);
  const addPerson = useRod((state) => state.addPerson);
  const updatePerson = useRod((state) => state.updatePerson);
  const removePerson = useRod((state) => state.removePerson);
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("бабушка");
  const [birthYear, setBirthYear] = useState("");
  const [maidenName, setMaidenName] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="grid gap-4">
      <form
        className="glass grid gap-3 rounded-4xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          addPerson({ name: name.trim(), relation, birthYear: birthYear.trim(), maidenName: maidenName.trim(), notes: "" });
          setName("");
          setBirthYear("");
          setMaidenName("");
          toast("Человек добавлен");
        }}
      >
        <Field label="Имя">
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Как зовут в семье" />
        </Field>
        <Field label="Кем приходится">
          <select className="field" value={relation} onChange={(event) => setRelation(event.target.value)}>
            {RELATIONS.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Год рождения" hint="Если помните примерно — так и напишите.">
            <input className="field" value={birthYear} onChange={(event) => setBirthYear(event.target.value)} placeholder="1948" />
          </Field>
          <Field label="Девичья фамилия">
            <input className="field" value={maidenName} onChange={(event) => setMaidenName(event.target.value)} placeholder="Если знаете" />
          </Field>
        </div>
        <Button type="submit" disabled={!name.trim()}>
          Добавить в семью
        </Button>
      </form>
      <ul className="grid gap-2">
        {people.map((person) => (
          <li key={person.id} className="glass rounded-3xl p-4">
            <button type="button" className="w-full text-left" onClick={() => setOpenId((value) => (value === person.id ? null : person.id))}>
              <p className="font-display text-2xl text-ink">{person.name}</p>
              <p className="text-sm text-muted">
                {person.relation}
                {person.birthYear ? ` · ${person.birthYear}` : ""}
                {person.maidenName ? ` · девичья ${person.maidenName}` : ""}
              </p>
            </button>
            {openId === person.id ? (
              <div className="mt-3 grid gap-3">
                <Field label="Заметки">
                  <textarea
                    className="field min-h-20"
                    value={person.notes}
                    onChange={(event) => updatePerson(person.id, { notes: event.target.value })}
                    placeholder="Фраза, привычка, чего не знаете"
                  />
                </Field>
                <Field label="Девичья фамилия">
                  <input
                    className="field"
                    value={person.maidenName}
                    onChange={(event) => updatePerson(person.id, { maidenName: event.target.value })}
                  />
                </Field>
                <button type="button" className="text-left text-sm text-muted underline" onClick={() => removePerson(person.id)}>
                  Убрать из семьи
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {people.length === 0 ? <p className="text-sm text-muted">Пока никого нет. Первое имя уже меняет книгу.</p> : null}
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
  const sorted = [...events].sort((a, b) => yearNum(a.year) - yearNum(b.year));
  const showingExample = sorted.length === 0;

  return (
    <div className="grid gap-4">
      <form
        className="glass grid gap-3 rounded-4xl p-5"
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
      {showingExample ? (
        <p className="text-sm text-muted">Так может выглядеть лента. Это пример, не ваши даты — он исчезнет, когда появится первое событие.</p>
      ) : (
        <p className="text-sm text-muted">Оказывается, ваша жизнь — один фрагмент более длинной истории.</p>
      )}
      <ol className="relative grid gap-0 border-l border-line pl-5">
        {(showingExample ? EXAMPLE_TIMELINE.map((item, index) => ({ ...item, id: `ex-${index}`, detail: "" })) : sorted).map((event) => (
          <li key={event.id} className="relative pb-5">
            <span className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-rose" />
            <p className="text-sm tabular-nums text-rose-deep">{event.year}</p>
            <p className="font-display text-2xl text-ink">{event.title}</p>
            {event.detail ? <p className="text-sm text-muted">{event.detail}</p> : null}
            {!showingExample ? (
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
  return (
    <div className="grid gap-3">
      <Button onClick={() => nav.go({ id: "photo-new" })}>Оцифровать фотографию</Button>
      {photos.length === 0 ? <p className="text-sm text-muted">Подпись важнее фильтра. Один старый снимок уже глава.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2">
        {photos.map((photo) => (
          <li key={photo.id} className="glass overflow-hidden rounded-4xl">
            <img src={photo.dataUrl} alt={photo.who || "Семейная фотография"} className="aspect-[4/3] w-full object-cover" />
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
      <form
        className="glass grid gap-3 rounded-4xl p-5"
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
      <ul className="grid gap-2">
        {places.map((place) => (
          <li key={place.id} className="glass rounded-3xl p-4">
            <p className="font-display text-2xl text-ink">{place.name}</p>
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
      <form
        className="glass grid gap-3 rounded-4xl p-5"
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
      <ul className="grid gap-2">
        {documents.map((doc) => (
          <li key={doc.id} className="glass rounded-3xl p-4">
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
