import { useRef, useState } from "react";
import { Mic, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { BONUS_PROMPTS, SITUATIONS, findSituation, type Situation } from "@/lib/rod/content";
import { storiesFromTalk } from "@/lib/rod/studio-ai";
import { turnPage } from "@/lib/rod/sounds";
import { useRod } from "@/lib/rod/store";
import { Button, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";
import { cn } from "@/lib/cn";

export function CardsScreen() {
  const nav = useNav();
  const notes = useRod((state) => state.notes);
  const removeNote = useRod((state) => state.removeNote);
  const addPage = useRod((state) => state.addPage);
  const [busy, setBusy] = useState(false);
  const words = notes.reduce((sum, note) => sum + note.answer.trim().split(/\s+/).filter(Boolean).length, 0);
  const play = SITUATIONS.filter((item) => item.play);
  const talks = SITUATIONS.filter((item) => !item.play);

  const harvest = () => {
    const transcript = notes
      .slice(0, 40)
      .map((note) => `Колода: ${note.situationTitle}\nВопрос: ${note.question}\nОтвет: ${note.answer}`)
      .join("\n\n");
    setBusy(true);
    void storiesFromTalk({ data: { transcript } })
      .then((result) => {
        if (!result.ok) {
          toast(result.error);
          return;
        }
        result.pages.forEach((draft) => {
          addPage({
            title: draft.title,
            kind: "page",
            paper: "cream",
            strokes: [],
            blocks: [
              { id: crypto.randomUUID(), type: "text", x: 8, y: 6, w: 84, text: draft.title, font: "serif", size: "lg" },
              { id: crypto.randomUUID(), type: "voice", x: 8, y: 22, w: 84, title: "Из карточек", transcript: draft.text },
            ],
          });
        });
        toast(result.pages.length > 1 ? "Из ответов собрались страницы книги" : "Страница из ответов готова");
        nav.tab({ id: "home" });
      })
      .catch(() => toast("Не получилось собрать страницы. Ответы никуда не делись."))
      .finally(() => setBusy(false));
  };

  return (
    <ScreenFrame>
      <TopBar kicker="Карточки" title="Спросите, пока можно" />
      <p className="max-w-xl text-muted">
        Передайте телефон. На карточке говорят в микрофон — коротко, как помнят. Ответы копятся, и из них можно собрать страницы.
      </p>

      <section className="wash-sage mt-5 rounded-4xl p-5">
        <p className="text-sm font-semibold text-ink">Уже сказано</p>
        <p className="mt-1 font-display text-3xl text-ink">
          {notes.length === 0 ? "Пока пусто" : `${notes.length} ${answersLabel(notes.length)}`}
        </p>
        <p className="text-sm text-muted">
          {notes.length === 0
            ? "Первый ответ появится после карточки."
            : words < 12
              ? `Около ${words} слов. Ещё пара живых ответов — и можно собрать страницы.`
              : `Около ${words} слов. Уже можно собрать страницы.`}
        </p>
        <Button className="mt-4" disabled={busy || words < 12} onClick={harvest}>
          {busy ? "Смотрим, что накопилось…" : "Собрать страницы из ответов"}
        </Button>
      </section>

      <ul className="mt-5 grid gap-3">
        {play.map((item) => (
          <li key={item.id}>
            <DeckLink item={item} saved={notes.filter((note) => note.situationId === item.id).length} onOpen={() => nav.go({ id: "deck", situationId: item.id })} featured />
          </li>
        ))}
      </ul>

      <h2 className="mt-6 font-display text-2xl text-ink">Разговоры</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {talks.map((item) => (
          <li key={item.id}>
            <DeckLink item={item} saved={notes.filter((note) => note.situationId === item.id).length} onOpen={() => nav.go({ id: "deck", situationId: item.id })} />
          </li>
        ))}
      </ul>

      {notes.length > 0 ? (
        <section className="mt-6">
          <h2 className="font-display text-2xl text-ink">Последние ответы</h2>
          <ul className="mt-3 grid gap-2">
            {notes.slice(0, 5).map((note) => (
              <li key={note.id} className="glass rounded-3xl p-4">
                <p className="text-sm text-rose-deep">{note.situationTitle}</p>
                <p className="mt-1 font-medium text-ink">{note.question}</p>
                <p className="mt-2 text-sm text-muted">{note.answer}</p>
                <button type="button" className="mt-2 text-sm text-muted underline" onClick={() => removeNote(note.id)}>
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </ScreenFrame>
  );
}

function DeckLink({
  item,
  saved,
  onOpen,
  featured = false,
}: {
  item: Situation;
  saved: number;
  onOpen: () => void;
  featured?: boolean;
}) {
  return (
    <button type="button" onClick={onOpen} className={cn("h-full w-full rounded-4xl p-5 text-left", featured ? "wash-blush" : "glass")}>
      <p className="text-sm text-rose-deep">{item.play ? "Семейная игра" : "Колода"}</p>
      <p className={cn("font-display text-ink", featured ? "text-4xl" : "text-2xl")}>{item.title}</p>
      <p className="mt-2 text-sm text-muted">{item.hint}</p>
      <p className="mt-3 text-sm text-ink">
        {item.questions.length} карточек{saved > 0 ? ` · сохранено ${saved}` : ""}
      </p>
    </button>
  );
}

export function DeckScreen({ situationId }: { situationId: string }) {
  const nav = useNav();
  const situation = findSituation(situationId);
  const addNote = useRod((state) => state.addNote);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leave, setLeave] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [listening, setListening] = useState(false);
  const dragRef = useRef(0);
  const origin = useRef(0);
  const recRef = useRef<SpeechRec | null>(null);

  if (!situation) {
    return (
      <ScreenFrame>
        <TopBar title="Колода не найдена" onBack={nav.back} />
      </ScreenFrame>
    );
  }

  const question = situation.questions[index];
  const done = index >= situation.questions.length;
  const round = roundOf(situation, index);

  const stopMic = () => {
    recRef.current?.stop();
    setListening(false);
  };

  const advance = (dir: 1 | -1, keep: boolean) => {
    if (leave !== null || done || !question) return;
    stopMic();
    if (keep && answer.trim()) {
      addNote({
        situationId: situation.id,
        situationTitle: situation.title,
        question,
        answer: answer.trim(),
      });
      toast("Ответ в колоде");
    }
    setLeave(dir * 130);
    turnPage();
    window.setTimeout(() => {
      setLeave(null);
      dragRef.current = 0;
      setDrag(0);
      setAnswer("");
      setFlipped(false);
      setIndex((value) => value + 1);
    }, 240);
  };

  const listen = () => {
    if (listening) {
      stopMic();
      return;
    }
    const rec = recognition();
    if (!rec) {
      toast("Микрофон здесь не открылся. Ответ можно вписать.");
      return;
    }
    const base = answer.trim();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let said = "";
      for (let i = 0; i < event.results.length; i += 1) said += event.results[i]?.[0]?.transcript ?? "";
      setAnswer(`${base} ${said}`.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const shift = leave ?? drag;

  return (
    <ScreenFrame>
      <TopBar title={situation.title} kicker={situation.play ? "Семейная игра" : "Колода"} onBack={nav.back} />
      {done ? (
        <section className="wash-blush rounded-4xl p-6">
          <h2 className="font-display text-4xl text-ink">Колода пройдена</h2>
          <p className="mt-2 text-muted">Ответы уже в книге. Если разговор зашёл далеко, соберите из них страницы.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => nav.tab({ id: "cards" })}>К накопленному</Button>
            <Button
              variant="soft"
              onClick={() => {
                setIndex(0);
                setAnswer("");
              }}
            >
              Сначала
            </Button>
          </div>
        </section>
      ) : (
        <>
          <p className="text-sm text-muted">{situation.play ? "Говорит следующий. Если не знаете — так и скажите." : situation.hint}</p>
          <div className="card-stage relative mx-auto mt-4 w-full max-w-sm" style={{ perspective: "1000px" }}>
            <CardBack className="absolute inset-x-8 top-6 bottom-0 scale-90 opacity-50" label="ещё в колоде" />
            <CardBack className="absolute inset-x-4 top-3 bottom-0 scale-95 opacity-80" label={situation.title} />
            <article
              className={cn("absolute inset-0", dragging ? "" : "transition-transform duration-200")}
              style={{ transform: `translateX(${shift}%) rotate(${shift / 18}deg)` }}
              onPointerDown={(event) => {
                if (flipped || (event.target as HTMLElement).closest("button, textarea")) return;
                origin.current = event.clientX;
                dragRef.current = 0;
                setDragging(true);
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!dragging) return;
                const next = event.clientX - origin.current;
                dragRef.current = next;
                setDrag(next / 3);
              }}
              onPointerUp={() => {
                if (!dragging) return;
                setDragging(false);
                const gone = dragRef.current;
                if (gone > 90) advance(1, true);
                else if (gone < -90) advance(-1, false);
                else setDrag(0);
              }}
              onPointerCancel={() => {
                setDragging(false);
                setDrag(0);
              }}
            >
              <div
                className="relative h-full"
                style={{
                  transformStyle: "preserve-3d",
                  transition: "transform 280ms ease",
                  transform: flipped ? "rotateY(180deg)" : "none",
                }}
              >
                <div className="card-face absolute inset-0 flex flex-col rounded-4xl p-5 shadow" style={{ backfaceVisibility: "hidden" }}>
                  <div className="flex items-center justify-between gap-2 text-sm text-rose-deep">
                    <span>{round ?? "Вопрос"}</span>
                    <span className="tabular-nums">
                      {index + 1} / {situation.questions.length}
                    </span>
                  </div>
                  <h2 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">{question}</h2>
                  <div className="mt-auto">
                    <textarea
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder="Скажите в микрофон или впишите"
                      className="field min-h-16 resize-none text-base"
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={listen}
                        className={cn(
                          "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold",
                          listening ? "bg-night text-paper" : "bg-rose text-paper",
                        )}
                      >
                        <Mic className="size-4" />
                        {listening ? "Слушаю… остановить" : "Ответить голосом"}
                      </button>
                      <button type="button" aria-label="Рубашка" onClick={() => { turnPage(); setFlipped(true); }} className="grid size-12 place-items-center rounded-full bg-paper text-ink">
                        <RotateCcw className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => { turnPage(); setFlipped(false); }} className="card-back absolute inset-0 flex flex-col justify-between rounded-4xl p-5 text-left" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}>
                  <span className="font-script text-3xl">Книга рода</span>
                  <span>
                    <span className="block font-display text-3xl">А откуда мы это знаем?</span>
                    <span className="mt-3 block text-sm leading-relaxed text-blush">
                      {BONUS_PROMPTS.slice(0, 5).join(" · ")}
                    </span>
                  </span>
                  <span className="text-sm">Нажмите, чтобы вернуться к вопросу</span>
                </button>
              </div>
            </article>
          </div>
          <p className="mt-3 text-center text-sm text-muted">Вправо — оставить ответ. Влево — следующая карточка.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Button variant="soft" onClick={() => advance(-1, false)}>
              Дальше
            </Button>
            <Button onClick={() => advance(1, true)} disabled={!answer.trim()}>
              Сохранить и дальше
            </Button>
          </div>
        </>
      )}
    </ScreenFrame>
  );
}

function CardBack({ className, label }: { className?: string; label: string }) {
  return (
    <div className={cn("card-back pointer-events-none flex items-end rounded-4xl p-4", className)}>
      <p className="font-script text-2xl">{label}</p>
    </div>
  );
}

function roundOf(situation: Situation, index: number) {
  if (!situation.rounds?.length) return null;
  const number = index + 1;
  let title = situation.rounds[0]?.title ?? null;
  for (const round of situation.rounds) {
    if (number >= round.start) title = round.title;
  }
  return title;
}

function answersLabel(count: number) {
  const n10 = count % 10;
  const n100 = count % 100;
  if (n10 === 1 && n100 !== 11) return "ответ";
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return "ответа";
  return "ответов";
}

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognition(): SpeechRec | null {
  const host = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  const Ctor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}
