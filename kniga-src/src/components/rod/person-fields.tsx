import { useRef } from "react";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { RELATIONS } from "@/lib/rod/content";
import { importImage } from "@/lib/rod/image";
import { useMedia } from "@/lib/rod/media";
import { composeName, genderOf, maidenAllowed, partsOf } from "@/lib/rod/person";
import { useRod } from "@/lib/rod/store";
import type { Person } from "@/lib/rod/types";
import { cn } from "@/lib/cn";
import { Field } from "@/components/rod/chrome";

export type PersonDraft = Omit<Person, "id">;

export const EMPTY_PERSON: PersonDraft = { name: "", relation: "бабушка", birthYear: "", maidenName: "", notes: "", parents: [] };

/** Цвета карточек: мужчины серые, женщины белые, оба пастельные. */
export const GENDER_LOOK = {
  m: { bg: "#dcdfe2", border: "#b9c0c7", ring: "#9aa4ad" },
  f: { bg: "#fffdfa", border: "#ecd9d6", ring: "#d9b9b4" },
  none: { bg: "#efeadf", border: "#d6cfbd", ring: "#bfb7a2" },
} as const;

export function lookOf(person: Pick<Person, "gender" | "relation">) {
  return GENDER_LOOK[genderOf(person) ?? "none"];
}

/** Кружок с фото человека; без фото – первая буква имени. */
export function PersonAvatar({ person, size = 48 }: { person: Pick<Person, "name" | "photo" | "gender" | "relation">; size?: number }) {
  const url = useMedia(person.photo);
  const look = lookOf(person);
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-ink/70" style={{ width: size, height: size, background: look.bg, boxShadow: `0 0 0 2px ${look.ring}`, fontSize: size * 0.4 }}>
      {url ? <img src={url} alt="" className="size-full object-cover" draggable={false} /> : person.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

/** Все поля человека. Общие для формы добавления и для карточки (меняем сразу, как печатаем). */
export function PersonFields({ value, onChange, others }: { value: PersonDraft; onChange: (patch: Partial<PersonDraft>) => void; others: Person[] }) {
  const parts = partsOf(value);
  const file = useRef<HTMLInputElement>(null);
  const setParts = (patch: Partial<typeof parts>) => {
    const next = { ...parts, ...patch };
    onChange({ ...next, name: composeName(next) });
  };
  const gender = genderOf(value);
  const pickPhoto = (source: File | undefined) => {
    if (!source) return;
    void importImage(source)
      .then((photo) => onChange({ photo }))
      .catch(() => toast("Фото не открылось"));
  };
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <PersonAvatar person={{ ...value, name: value.name || "?" }} size={64} />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-moss/50 px-4 text-sm font-semibold text-moss" onClick={() => file.current?.click()}>
            <Camera className="size-4" /> {value.photo ? "Другое фото" : "Добавить фото"}
          </button>
          {value.photo ? (
            <button type="button" aria-label="Убрать фото" className="grid size-11 place-items-center rounded-full border border-ink/15 text-muted" onClick={() => onChange({ photo: undefined })}>
              <X className="size-4" />
            </button>
          ) : null}
          <input
            ref={file}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              pickPhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Фамилия">
          <input className="field" value={parts.lastName} onChange={(event) => setParts({ lastName: event.target.value })} />
        </Field>
        <Field label="Имя">
          <input className="field" value={parts.firstName} onChange={(event) => setParts({ firstName: event.target.value })} placeholder="Как зовут в семье" />
        </Field>
        <Field label="Отчество">
          <input className="field" value={parts.patronymic} onChange={(event) => setParts({ patronymic: event.target.value })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Кем приходится">
          <select className="field" value={value.relation} onChange={(event) => onChange({ relation: event.target.value })}>
            {(RELATIONS.includes(value.relation) ? RELATIONS : [value.relation, ...RELATIONS]).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </Field>
        <Field label="Пол">
          <div className="flex gap-2">
            {(
              [
                ["f", "Женщина"],
                ["m", "Мужчина"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={gender === id} onClick={() => onChange({ gender: id })} className={cn("min-h-11 flex-1 rounded-xl border px-3 text-sm font-semibold", gender === id ? "border-moss bg-moss text-paper" : "border-ink/15 bg-white/70 text-ink")}>
                {label}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Год рождения" hint="Появится на ленте. Можно примерно.">
          <input className="field" value={value.birthYear} onChange={(event) => onChange({ birthYear: event.target.value })} placeholder="1948" />
        </Field>
        <Field label="Год ухода" hint="Если нужно. Тоже на ленте.">
          <input className="field" value={value.deathYear ?? ""} onChange={(event) => onChange({ deathYear: event.target.value })} />
        </Field>
      </div>
      {maidenAllowed(value) ? (
        <Field label="Девичья фамилия">
          <input className="field" value={value.maidenName} onChange={(event) => onChange({ maidenName: event.target.value })} placeholder="Если знаете" />
        </Field>
      ) : null}
      {others.length ? (
        <Field label="Супруг или супруга" hint="Пара встанет в древе в одном ряду.">
          <select className="field" value={value.spouse ?? ""} onChange={(event) => onChange({ spouse: event.target.value || undefined })}>
            <option value="">Не выбрано</option>
            {others.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.relation})
              </option>
            ))}
          </select>
          {value.spouse ? (
            <select className="field mt-2" value={value.spouseStatus ?? "married"} onChange={(event) => onChange({ spouseStatus: event.target.value as "married" | "divorced" | "partners" })}>
              <option value="married">В браке</option>
              <option value="divorced">Развелись</option>
              <option value="partners">Живут вместе</option>
            </select>
          ) : null}
        </Field>
      ) : null}
      {others.length ? (
        <Field label="Чей ребёнок" hint="Родители нужны для древа.">
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((slot) => (
              <select
                key={slot}
                className="field"
                value={value.parents?.[slot] ?? ""}
                onChange={(event) => {
                  const next = [...(value.parents ?? [])];
                  next[slot] = event.target.value;
                  onChange({ parents: next.filter(Boolean) });
                }}
              >
                <option value="">{slot === 0 ? "Родитель 1" : "Родитель 2"}</option>
                {others.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.relation})
                  </option>
                ))}
              </select>
            ))}
          </div>
        </Field>
      ) : null}
      <Field label="Комментарий">
        <textarea className="field min-h-20" value={value.notes} onChange={(event) => onChange({ notes: event.target.value })} placeholder="Фраза, привычка, чего не знаете" />
      </Field>
    </div>
  );
}

/** Карточка человека: правим сразу в списке людей. */
export function PersonEditor({ person, onRemoved }: { person: Person; onRemoved?: () => void }) {
  const people = useRod((state) => state.people);
  const updatePerson = useRod((state) => state.updatePerson);
  const removePerson = useRod((state) => state.removePerson);
  return (
    <div className="grid gap-3">
      <PersonFields value={person} onChange={(patch) => updatePerson(person.id, patch)} others={people.filter((item) => item.id !== person.id)} />
      <button
        type="button"
        className="text-left text-sm text-muted underline"
        onClick={() => {
          removePerson(person.id);
          onRemoved?.();
        }}
      >
        Убрать из семьи
      </button>
    </div>
  );
}
