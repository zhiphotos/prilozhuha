import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus } from "lucide-react";
import { importImage } from "@/lib/rod/image";
import { MediaImg } from "@/components/rod/media-img";
import { useRod } from "@/lib/rod/store";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

export function PhotoNewScreen() {
  const nav = useNav();
  const people = useRod((state) => state.people);
  const addPhoto = useRod((state) => state.addPhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dataUrl, setDataUrl] = useState("");
  const [who, setWho] = useState("");
  const [personId, setPersonId] = useState("");
  const [where, setWhere] = useState("");
  const [year, setYear] = useState("");
  const [what, setWhat] = useState("");
  const [photographer, setPhotographer] = useState("");
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const next = await importImage(file);
      setDataUrl(next);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Снимок не открылся");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenFrame>
      <TopBar title="Оцифруй фотографию" kicker="Снимок и история" onBack={nav.back} />
      <p className="text-muted">Важнее не хранить файл, а привязать его к человеку и событию.</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {dataUrl ? (
        <MediaImg src={dataUrl} alt="Предпросмотр семейной фотографии" className="mt-4 max-h-[60vh] w-full rounded-[2rem] object-contain shadow-lg" />
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="glass mt-4 flex min-h-48 w-full flex-col items-center justify-center gap-2 rounded-[2rem] p-6 text-ink"
        >
          <ImagePlus className="size-6 text-rose-deep" />
          <span className="font-medium">{busy ? "Открываем снимок…" : "Сфотографировать или выбрать"}</span>
          <span className="text-sm text-muted">Старое фото при дневном свете, без вспышки в упор</span>
        </button>
      )}
      {dataUrl ? (
        <button type="button" className="mt-2 text-sm text-muted underline" onClick={() => inputRef.current?.click()}>
          Выбрать другое
        </button>
      ) : null}
      <form
        className="mt-4 grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!dataUrl || !who.trim()) return;
          const ok = addPhoto({
            dataUrl,
            who: who.trim(),
            where: where.trim(),
            year: year.trim(),
            what: what.trim(),
            photographer: photographer.trim(),
            personId,
          });
          if (!ok) {
            toast("Архив переполнен. Удалите несколько фото.");
            return;
          }
          toast("Фотография сохранена вместе с историей");
          nav.tab({ id: "archive", tab: "photos" });
        }}
      >
        <Field label="Кто на фото?">
          <input className="field" value={who} onChange={(event) => setWho(event.target.value)} placeholder="Бабушка Нина и мама" />
        </Field>
        {people.length > 0 ? (
          <Field label="Привязать к человеку из семьи" hint="Необязательно.">
            <select className="field" value={personId} onChange={(event) => setPersonId(event.target.value)}>
              <option value="">Не привязывать</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name} · {person.relation}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Где?">
          <input className="field" value={where} onChange={(event) => setWhere(event.target.value)} placeholder="Двор на Ленина" />
        </Field>
        <Field label="Примерный год?">
          <input className="field" value={year} onChange={(event) => setYear(event.target.value)} placeholder="около 1974" />
        </Field>
        <Field label="Что происходило?">
          <textarea className="field min-h-24" value={what} onChange={(event) => setWhat(event.target.value)} placeholder="Перед щелчком, чего не видно в кадре" />
        </Field>
        <Field label="Кто фотографировал?">
          <input className="field" value={photographer} onChange={(event) => setPhotographer(event.target.value)} placeholder="Дедушка или уличный фотограф" />
        </Field>
        <Button type="submit" disabled={!dataUrl || !who.trim() || busy}>
          Сохранить фотографию
        </Button>
      </form>
    </ScreenFrame>
  );
}
