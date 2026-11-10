import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { SearchSelect } from "@/components/rod/search-select";
import { personCardText } from "@/lib/rod/person-card";
import { useRod } from "@/lib/rod/store";

/** Краткая карточка человека: поставить стикером на страницу или скопировать текстом. */
export function PersonCardSheet({ onClose, onPlace }: { onClose: () => void; onPlace: (text: string) => void }) {
  const people = useRod((s) => s.people);
  const [id, setId] = useState("");
  const person = people.find((p) => p.id === id);
  const text = useMemo(() => (person ? personCardText(person, people) : ""), [person, people]);
  return (
    <Sheet title="Карточка человека" onClose={onClose}>
      <p className="text-sm text-muted">Выберите человека: имя, годы жизни, родители, муж или жена, братья и сёстры и дети соберутся в короткую карточку.</p>
      <div className="mt-3">
        <SearchSelect label="Человек" value={id} onChange={setId} empty="Выбрать человека" options={people.map((p) => ({ value: p.id, label: p.name || "Без имени" }))} />
      </div>
      {text ? <pre className="mt-3 whitespace-pre-wrap rounded-2xl bg-white/70 p-3 font-sans text-sm text-ink">{text}</pre> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          disabled={!text}
          onClick={() => {
            onPlace(text);
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
              .writeText(text)
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
