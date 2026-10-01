import { audienceTitle } from "@/lib/rod/content";
import { countsOf, isBookReady, overallOf, partsOf, plural } from "@/lib/rod/progress";
import { useRod } from "@/lib/rod/store";
import { Button, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

export function BookScreen() {
  const nav = useNav();
  const data = useRod();
  const snapshot = {
    people: data.people,
    places: data.places,
    photos: data.photos,
    stories: data.stories,
    documents: data.documents,
    notes: data.notes,
    events: data.events,
    audience: data.audience,
    dedicatee: data.dedicatee,
  };
  const overall = overallOf(partsOf(snapshot));
  const ready = isBookReady(snapshot, overall);
  const counts = countsOf(snapshot);
  const events = [...data.events].sort((a, b) => yearNum(a.year) - yearNum(b.year));
  const coverName = data.collector.trim() || "Семья";
  const forWhom = data.dedicatee.trim() || audienceTitle(data.audience);

  return (
    <ScreenFrame>
      <div className="no-print">
        <TopBar title="Книга" kicker="Первая версия" onBack={nav.back} action={
          <Button variant="soft" onClick={() => window.print()}>
            Печать или PDF
          </Button>
        } />
      </div>
      {ready ? (
        <p className="mb-4 font-display text-3xl text-ink">Ты собрал достаточно материала для своей первой книги рода.</p>
      ) : (
        <p className="mb-4 text-muted">
          Книга уже открывается черновиком. Она станет плотнее, когда появятся люди, хотя бы одна история и фотографии или места.
        </p>
      )}
      <article className="grid gap-4">
        <section className="glass-dark rounded-4xl p-6 sm:p-8">
          <p className="text-sm text-blush">Книга рода</p>
          <h2 className="mt-3 font-display text-5xl text-paper">{coverName}</h2>
          <p className="mt-3 text-paper/80">{forWhom}</p>
        </section>
        <section className="glass rounded-4xl p-6">
          <h2 className="font-display text-3xl text-ink">Сейчас в ней</h2>
          <p className="mt-2 text-sm text-muted">
            {plural(counts.photos, "фотография", "фотографии", "фотографий")} · {plural(counts.people, "родственник", "родственника", "родственников")} ·{" "}
            {plural(counts.stories, "история", "истории", "историй")} · {plural(counts.places, "место", "места", "мест")} ·{" "}
            {plural(counts.notes, "разговор", "разговора", "разговоров")}
          </p>
        </section>
        <section className="glass rounded-4xl p-6">
          <h2 className="font-display text-3xl text-ink">Люди</h2>
          {data.people.length === 0 ? <p className="mt-2 text-sm text-muted">Имён пока нет.</p> : null}
          <ul className="mt-3 grid gap-3">
            {data.people.map((person) => (
              <li key={person.id}>
                <p className="font-medium text-ink">
                  {person.name} <span className="font-normal text-muted">· {person.relation}</span>
                </p>
                <p className="text-sm text-muted">
                  {[person.birthYear && `род. ${person.birthYear}`, person.maidenName && `девичья ${person.maidenName}`, person.notes]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="glass rounded-4xl p-6">
          <h2 className="font-display text-3xl text-ink">Лента</h2>
          {events.length === 0 ? <p className="mt-2 text-sm text-muted">Годы ещё не расставлены.</p> : null}
          <ul className="mt-3 grid gap-2">
            {events.map((event) => (
              <li key={event.id} className="text-ink">
                <span className="tabular-nums text-rose-deep">{event.year}</span> — {event.title}
                {event.detail ? <span className="text-muted">. {event.detail}</span> : null}
              </li>
            ))}
          </ul>
        </section>
        {data.stories.map((story) => (
          <section key={story.id} className="glass rounded-4xl p-6">
            <h2 className="font-display text-3xl text-ink">{story.title}</h2>
            <p className="mt-3 whitespace-pre-wrap text-ink">{story.narrative}</p>
          </section>
        ))}
        {data.photos.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-2">
            {data.photos.map((photo) => (
              <figure key={photo.id} className="glass overflow-hidden rounded-4xl">
                <img src={photo.dataUrl} alt={photo.who || "Семейная фотография"} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="p-4 text-sm text-ink">
                  <span className="font-medium">{photo.who}</span>
                  <span className="mt-1 block text-muted">
                    {[photo.where, photo.year, photo.what, photo.photographer && `снимал ${photo.photographer}`].filter(Boolean).join(" · ")}
                  </span>
                </figcaption>
              </figure>
            ))}
          </section>
        ) : null}
        {data.places.length > 0 ? (
          <section className="glass rounded-4xl p-6">
            <h2 className="font-display text-3xl text-ink">Места</h2>
            <ul className="mt-3 grid gap-2">
              {data.places.map((place) => (
                <li key={place.id}>
                  <p className="font-medium text-ink">{place.name}</p>
                  <p className="text-sm text-muted">{[place.years, place.note].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {data.notes.length > 0 ? (
          <section className="glass rounded-4xl p-6">
            <h2 className="font-display text-3xl text-ink">Разговоры</h2>
            <ul className="mt-3 grid gap-3">
              {data.notes.map((note) => (
                <li key={note.id}>
                  <p className="text-sm text-rose-deep">{note.situationTitle}</p>
                  <p className="font-medium text-ink">{note.question}</p>
                  <p className="text-sm text-muted">{note.answer}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="wash-blush no-print rounded-4xl p-6">
          <h2 className="font-display text-3xl text-ink">
            {ready ? "Не знаешь, как превратить эти материалы в настоящую историю семьи?" : "Когда материалов станет больше, их ещё предстоит превратить в главы"}
          </h2>
          <p className="mt-2 text-sm text-muted">Программа «Книга рода» про голос, структуру и бережность к чужой памяти — не про то, как завести таблицу.</p>
          <Button className="mt-4" onClick={() => nav.go({ id: "lessons" })}>
            Посмотреть программу «Книга рода»
          </Button>
        </section>
      </article>
    </ScreenFrame>
  );
}

function yearNum(value: string): number {
  const match = value.match(/\d{3,4}/);
  return match ? Number(match[0]) : 9999;
}
