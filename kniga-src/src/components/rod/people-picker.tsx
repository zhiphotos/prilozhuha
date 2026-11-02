"use client";

import { useState } from "react";

/** Выбор родственников из списка «Люди» (он же основа древа): отмеченные видны чипами, остальных ищут по имени и добавляют нажатием. */
export function PeoplePicker({ value, onChange, people }: { value: string[]; onChange: (next: string[]) => void; people: { id: string; name: string; relation: string }[] }) {
  const [query, setQuery] = useState("");
  const chosen = value.map((id) => people.find((person) => person.id === id)).filter((person): person is NonNullable<typeof person> => Boolean(person));
  const q = query.trim().toLowerCase();
  const matches = people.filter((person) => !value.includes(person.id) && (!q || `${person.name} ${person.relation}`.toLowerCase().includes(q))).slice(0, q ? 12 : 8);
  if (!people.length) return <p className="text-sm text-muted">Пока в списке нет людей. Добавьте их во вкладке «Люди» или загрузите древо из файла, и тогда их можно будет отметить здесь.</p>;
  return (
    <div className="grid gap-2">
      {chosen.length ? (
        <div className="flex flex-wrap gap-2">
          {chosen.map((person) => (
            <button key={person.id} type="button" aria-label={`Убрать: ${person.name}`} className="min-h-10 rounded-full border border-ink bg-ink px-3 text-sm text-paper" onClick={() => onChange(value.filter((id) => id !== person.id))}>
              {person.name || person.relation} ✕
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Пока никто не отмечен.</p>
      )}
      <input className="field" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Найти в списке (${people.length} человек)`} />
      <ul className="grid max-h-56 gap-1 overflow-y-auto">
        {matches.map((person) => (
          <li key={person.id}>
            <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-ink/15 bg-white/70 px-3 text-left text-sm text-ink"
              // Пока открыта клавиатура, касание по списку на iPhone сначала убирало фокус из поля, список сдвигался и нажатие не попадало в кнопку.
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(value.includes(person.id) ? value : [...value, person.id]);
                setQuery("");
              }}
            >
              <span className="truncate">{person.name || "Без имени"}</span>
              <span className="shrink-0 text-xs text-muted">{person.relation} · добавить</span>
            </button>
          </li>
        ))}
        {!matches.length && q ? <li className="px-1 text-sm text-muted">Никого не нашлось, проверьте написание.</li> : null}
      </ul>
    </div>
  );
}
