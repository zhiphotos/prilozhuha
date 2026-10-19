import { useEffect, useRef, useState } from "react";
import { Camera, Check } from "lucide-react";
import { toast } from "sonner";
import { RELATIONS, SITUATIONS } from "@/lib/rod/content";
import { compressPhoto, roomInfo, sendToRoom } from "@/lib/rod/family";
import { useRod } from "@/lib/rod/store";
import { Button, Field, useNav } from "@/components/rod/chrome";
import { cn } from "@/lib/cn";

const QUESTIONS = SITUATIONS.find((item) => item.id === "kin")?.questions.slice(0, 10) ?? [];
type Mode = "story" | "answer" | "photo";

/** Страница для родственника, которого пригласили: ничего не нужно ставить и платить. Уроки и книга владельца ему не показываются. */
export function JoinScreen({ room, invite }: { room: string; invite: string }) {
  const nav = useNav();
  const [info, setInfo] = useState<{ ok: boolean; name?: string; error?: string } | null>(null);
  const [mode, setMode] = useState<Mode>("story");
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState(QUESTIONS[0] ?? "");
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void roomInfo(room, invite).then(setInfo).catch(() => setInfo({ ok: false, error: "Нет связи. Попробуйте позже." }));
  }, [room, invite]);

  const ready = name.trim() && (mode === "photo" ? photo : text.trim().length > 2);
  const send = async () => {
    setBusy(true);
    try {
      await sendToRoom(room, invite, { kind: mode, from: { name: name.trim(), relation }, title, question: mode === "answer" ? question : "", text, photo: mode === "photo" ? photo : undefined });
      setSent((value) => value + 1);
      setTitle("");
      setText("");
      setPhoto("");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось отправить.", { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  const box = "mx-auto w-full max-w-lg pb-6";
  if (!info) return <div className={box}><p className="mt-20 text-center text-muted">Открываю приглашение…</p></div>;
  if (!info.ok) {
    return (
      <div className={box}>
        <h1 className="display-title mt-16 text-[1.8rem] text-ink">Приглашение не открылось</h1>
        <p className="mt-3 text-muted">{info.error || "Ссылка больше не действует. Попросите прислать новую."}</p>
      </div>
    );
  }
  return (
    <div className={box}>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-ink">Книга рода</p>
      <h1 className="display-title mt-2 text-[2rem] leading-[1.1] text-ink">{info.name} приглашает вас помочь с семейной книгой</h1>
      <p className="mt-3 text-base leading-relaxed text-ink/80">
        Расскажите то, что помните: случай из детства, как пахла бабушкина кухня, как познакомились родители. Можно прислать и старое фото. Достаточно пары слов. Ничего устанавливать и платить не нужно, чтобы помочь.
      </p>

      {sent > 0 ? (
        <div className="wash-sage mt-6 rounded-2xl p-5">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Check className="size-5 text-moss" /> Спасибо! Отправлено: {sent}
          </p>
          <p className="mt-1 text-sm text-ink/75">Это уже в книге. Если вспомнится ещё что-то, добавьте ниже.</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Как вас зовут">
            <input className="field" value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, Нина" />
          </Field>
          <Field label="Кем приходитесь">
            <select className="field" value={relation} onChange={(event) => setRelation(event.target.value)}>
              <option value="">Не важно</option>
              {RELATIONS.filter((item) => item !== "я").map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex gap-2" role="tablist">
          {(
            [
              ["story", "Воспоминание"],
              ["answer", "Ответить на вопрос"],
              ["photo", "Фото"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={cn("min-h-11 flex-1 rounded-full border px-3 text-sm font-semibold", mode === id ? "border-moss bg-moss text-paper" : "border-ink/15 bg-white/70 text-ink")}>
              {label}
            </button>
          ))}
        </div>

        {mode === "story" ? (
          <Field label="О чём это (можно без названия)">
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, Дом на Еловой" />
          </Field>
        ) : null}
        {mode === "answer" ? (
          <Field label="Вопрос">
            <select className="field" value={question} onChange={(event) => setQuestion(event.target.value)}>
              {QUESTIONS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        ) : null}
        {mode === "photo" ? (
          <div>
            <button type="button" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-moss/50 px-5 text-sm font-semibold text-moss" onClick={() => file.current?.click()}>
              <Camera className="size-4" /> {photo ? "Другое фото" : "Выбрать фото"}
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                if (picked) void compressPhoto(picked).then(setPhoto).catch(() => toast("Фото не открылось"));
              }}
            />
            {photo ? <img src={photo} alt="" className="mt-3 max-h-64 rounded-2xl" /> : null}
          </div>
        ) : null}
        <Field label={mode === "photo" ? "Что на фото, кто, когда" : mode === "answer" ? "Ваш ответ" : "Ваш рассказ"}>
          <textarea className="field min-h-36" value={text} onChange={(event) => setText(event.target.value)} placeholder={mode === "photo" ? "Мы на рыбалке, 1985 год" : "Пишите, как помните"} />
        </Field>

        <Button disabled={busy || !ready} onClick={() => void send()} className="w-full">
          {busy ? "Отправляю…" : "Отправить в книгу"}
        </Button>
        <p className="text-xs leading-snug text-muted">
          Ваше имя и то, что вы отправите, увидит только хозяйка книги. Отправляя, вы соглашаетесь с{" "}
          <button type="button" className="underline" onClick={() => nav.go({ id: "legal", doc: "privacy" })}>
            политикой обработки данных
          </button>
          .
        </p>
      </div>
      <Promo />
    </div>
  );
}

/** Родственник может сделать такую же книгу про свою семью: бесплатный урок и программа. */
function Promo() {
  const nav = useNav();
  // Родственнику не нужно проходить знакомство, чтобы посмотреть урок: открываем приложение с настройками по умолчанию.
  const enter = () => {
    const state = useRod.getState();
    if (!state.onboarded) state.finishOnboarding({ audience: "family", dedicatee: "", collector: "" });
  };
  return (
    <section className="mt-10 rounded-3xl bg-[#14160f] p-6 text-paper">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9ae74]">А вы хотите свою?</p>
      <h2 className="display-title mt-2 text-[1.6rem] leading-tight">Книга Рода – это до слёз и смеха</h2>
      <p className="mt-2 text-sm leading-relaxed text-paper/80">Такая же семейная книга про вашу семью: помощник задаёт вопросы, вы просто вспоминаете. Начните с бесплатного урока на 12 минут.</p>
      <div className="mt-4 grid gap-2.5">
        <Button variant="white" className="w-full" onClick={() => { enter(); nav.go({ id: "lesson", lessonId: "start" }); }}>
          Смотреть бесплатный урок
        </Button>
        <Button variant="soft" className="w-full" onClick={() => { enter(); nav.tab({ id: "lessons" }); }}>
          Посмотреть всю программу
        </Button>
      </div>
    </section>
  );
}
