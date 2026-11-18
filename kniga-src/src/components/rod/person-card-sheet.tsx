import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { SearchSelect } from "@/components/rod/search-select";
import { ALL_PARTS, personCardTidy, type CardParts } from "@/lib/rod/person-card";
import { useRod } from "@/lib/rod/store";

/** Краткая карточка человека: поставить стикером на страницу или скопировать текстом. */
export function PersonCardSheet({ onClose, onPlace }: { onClose: () => void; onPlace: (text: string, photo?: string) => void }) {
  const people = useRod((s) => s.people);
  const [id, setId] = useState("");
  const person = people.find((p) => p.id === id);
  const [parts, setParts] = useState<CardParts>(ALL_PARTS);
  const [withPhoto, setWithPhoto] = useState(true);
  const text = useMemo(() => (person ? personCardTidy(person, people, parts) : ""), [person, people, parts]);
  const hasPhoto = Boolean(person?.photo);
  const boxes: [keyof CardParts, string][] = [["details", "Годы жизни и место"], ["parents", "Родители"], ["spouse", "Муж или жена"], ["siblings", "Братья и сёстры"], ["children", "Дети"]];
  return (
    <Sheet title="Карточка человека" onClose={onClose}>
      <p className="text-sm text-muted">Выберите человека: имя, годы жизни, родители, муж или жена, братья и сёстры и дети соберутся в короткую карточку.</p>
      <div className="mt-3">
        <SearchSelect label="Человек" value={id} onChange={setId} empty="Выбрать человека" options={people.map((p) => ({ value: p.id, label: p.name || "Без имени" }))} />
      </div>
      {person ? (
        <div className="mt-3 grid gap-2 text-sm text-ink">
          <label className={`flex min-h-11 items-center gap-3 rounded-xl border border-ink/15 px-3 ${hasPhoto ? "" : "opacity-50"}`}>
            <input type="checkbox" className="size-5" disabled={!hasPhoto} checked={hasPhoto && withPhoto} onChange={(e) => setWithPhoto(e.target.checked)} />
            {hasPhoto ? "С фото" : "С фото (у человека нет фото)"}
          </label>
          {boxes.map(([key, label]) => (
            <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-ink/15 px-3">
              <input type="checkbox" className="size-5" checked={parts[key]} onChange={(e) => setParts({ ...parts, [key]: e.target.checked })} />
              {label}
            </label>
          ))}
        </div>
      ) : null}
      {text ? <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/70 p-3 font-sans text-sm text-ink">{text.replace(/\*\*/g, "")}</pre> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={!text}
          onClick={() => {
            onPlace(text, hasPhoto && withPhoto ? person?.photo : undefined);
            onClose();
          }}
        >
          Поставить на страницу
        </Button>
        <Button
          variant="soft"
          disabled={!text}
          onClick={() => {
            void navigator.clipboard
              .writeText(text.replace(/\*\*/g, ""))
              .then(() => toast("Карточка скопирована"))
              .catch(() => toast("Не получилось скопировать"));
          }}
        >
          Скопировать
        </Button>
      </div>
    </Sheet>
  );
}
