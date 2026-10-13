import { useRef, useState } from "react";
import { Lightbulb, Mic, SkipForward } from "lucide-react";
import { Cut, packBg } from "@/components/rod/botanica";
import { toast } from "sonner";
import { BONUS_PROMPTS, SITUATIONS, findSituation, type Situation } from "@/lib/rod/content";
import { turnPage } from "@/lib/rod/sounds";
import { useRod } from "@/lib/rod/store";
import type { PageBlock } from "@/lib/rod/types";
import { recognition, type SpeechRec } from "@/lib/rod/speech";
import { Button, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";
import { cn } from "@/lib/cn";

/** Каждая колода: свой мотив из её фото-библиотеки, номер в каталоге и поверхность. */
const CAT: Record<string, { tag: string; cut: string; tilt: number; tone: "night" | "paper" | "moss" | "plum" }> = {
  kin: { tag: "для рода", cut: "engraving_circle", tilt: 0, tone: "night" },
  feast: { tag: "за столом", cut: "rosebuds", tilt: 8, tone: "paper" },
  mom: { tag: "для мамы", cut: "peony", tilt: -6, tone: "plum" },
  dad: { tag: "для папы", cut: "driftwood", tilt: 6, tone: "paper" },
  grandma: { tag: "для бабушки", cut: "lily_valley", tilt: 4, tone: "moss" },
  grandpa: { tag: "для дедушки", cut: "wood_slice", tilt: -8, tone: "paper" },
  album: { tag: "над альбомом", cut: "paper_two_scraps", tilt: 5, tone: "paper" },
  dinner: { tag: "за ужином", cut: "daffodil", tilt: -10, tone: "paper" },
  road: { tag: "в дороге", cut: "stick_rosehip", tilt: 14, tone: "moss" },
};
const catOf = (id: string) => CAT[id] ?? { tag: "", cut: "moth", tilt: 0, tone: "paper" as const };
const numberOf = (id: string) => String(Math.max(0, SITUATIONS.findIndex((item) => item.id === id)) + 1).padStart(2, "0");

export function CardsScreen() {
  const nav = useNav();
  const notes = useRod((state) => state.notes);
  const removeNote = useRod((state) => state.removeNote);
  const addPage = useRod((state) => state.addPage);
  const words = notes.reduce((sum, note) => sum + note.answer.trim().split(/\s+/).filter(Boolean).length, 0);
  const play = SITUATIONS.filter((item) => item.play);
  const talks = SITUATIONS.filter((item) => !item.play);

  const harvest = () => {
    // Каждая колода – своя страница: вопрос карточкой, ответ рукописным.
    const groups = new Map<string, typeof notes>();
    notes.slice(0, 40).forEach((note) => groups.set(note.situationTitle, [...(groups.get(note.situationTitle) ?? []), note]));
    let first: string | null = null;
    groups.forEach((list, title) => {
      const blocks: PageBlock[] = [{ id: crypto.randomUUID(), type: "text", x: 8, y: 5, w: 84, text: title, font: "serif", size: "lg" }];
      let y = 16;
      list.slice(0, 4).forEach((note, i) => {
        blocks.push({ id: crypto.randomUUID(), type: "text", x: 8, y, w: 60, text: note.question, font: "sans", size: "sm", look: "card", rotate: i % 2 ? 1 : -1 });
        blocks.push({ id: crypto.randomUUID(), type: "text", x: 12, y: y + 8, w: 80, text: note.answer, font: "script", size: "md" });
        y += 20;
      });
      const id = addPage({ title, kind: "page", paper: "lined", strokes: [], blocks });
      first ??= id;
    });
    toast(groups.size > 1 ? "Из ответов собрались страницы книги" : "Страница из ответов готова");
    if (first) nav.go({ id: "editor", pageId: first });
  };

  return (
    <ScreenFrame>
      <TopBar kicker="Вопросы" title="Спросите, пока можно" />
      <p className="max-w-xl text-muted">
        Передайте телефон. На карточке говорят в микрофон: коротко, как помнят. Ответы копятся, и из них можно собрать страницы.
      </p>

      <section className="mt-6 border-y border-ink/15 py-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Уже сказано</p>
            <p className="display-title mt-1 text-[2.4rem] leading-none text-ink">{notes.length === 0 ? "Пока пусто" : `${notes.length} ${answersLabel(notes.length)}`}</p>
          </div>
          <Button disabled={words < 12} onClick={harvest}>
            Собрать страницы
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted">
          {notes.length === 0 ? "Первый ответ появится после карточки." : words < 12 ? `Около ${words} слов. Ещё пара живых ответов, и можно собрать страницы.` : `Около ${words} слов. Уже можно собрать страницы.`}
        </p>
      </section>

      <ul className="mt-6 grid gap-3">
        {play.map((item) => (
          <li key={item.id}>
            <DeckLink item={item} saved={notes.filter((note) => note.situationId === item.id).length} onOpen={() => nav.go({ id: "deck", situationId: item.id })} featured />
          </li>
        ))}
      </ul>

      <h2 className="display-title mt-9 text-[1.8rem] text-ink">Разговоры</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3">
        {talks.map((item) => (
          <li key={item.id}>
            <DeckLink item={item} saved={notes.filter((note) => note.situationId === item.id).length} onOpen={() => nav.go({ id: "deck", situationId: item.id })} />
          </li>
        ))}
      </ul>

      {notes.length > 0 ? (
        <section className="mt-9">
          <h2 className="display-title text-[1.8rem] text-ink">Последние ответы</h2>
          <ul className="mt-3 grid gap-2">
            {notes.slice(0, 5).map((note) => (
              <li key={note.id} className="glass rounded-2xl p-4">
                <p className="text-sm text-gold-ink">{note.situationTitle}</p>
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

function DeckLink({ item, saved, onOpen, featured = false }: { item: Situation; saved: number; onOpen: () => void; featured?: boolean }) {
  const cat = catOf(item.id);
  const total = item.questions.length;
  const share = Math.min(100, Math.round((saved / Math.max(1, total)) * 100));
  const dark = featured || cat.tone === "night";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "relative block h-full w-full overflow-hidden rounded-2xl p-4 text-left",
        featured ? "forest min-h-52 p-6 pr-32" : cat.tone === "moss" ? "wash-sage min-h-48" : cat.tone === "plum" ? "wash-blush min-h-48" : "glass min-h-48",
      )}
      style={featured ? { ["--forest-img" as string]: packBg("bg_8146") } : undefined}
    >
      <span className={cn("text-[11px] font-semibold uppercase tracking-[0.16em]", dark ? "text-[#c9ae74]" : "text-gold-ink")}>
        № {numberOf(item.id)} · {item.play ? "Семейная игра" : "Колода"}
      </span>
      <span className={cn("display-title mt-2 block", featured ? "max-w-[12ch] text-[2.4rem] leading-[1.02] text-paper" : "relative z-10 max-w-[11ch] text-[1.45rem] leading-[1.08] text-ink")}>{item.title}</span>
      {cat.tag ? <span className={cn("hand relative z-10 mt-1 block whitespace-nowrap text-[1.12rem] leading-none [transform:rotate(-2deg)]", dark ? "text-[#c9ae74]" : "text-gold-ink")}>{cat.tag}</span> : null}
      {featured ? <span className="mt-2 block max-w-[28ch] text-sm text-paper/75">{item.hint}</span> : null}
      <span className={cn("relative z-10 mt-4 block text-xs", featured ? "" : "max-w-[56%]", dark ? "text-paper/80" : "text-ink/75")}>
        {saved > 0 ? `Отвечено ${saved} из ${total}` : `${total} карточек · начните с первой`}
      </span>
      {saved > 0 ? (
        <span className={cn("mt-1.5 block h-[2px] w-full", dark ? "bg-paper/20" : "bg-ink/10")}>
          <span className="block h-full bg-gold" style={{ width: `${Math.max(share, 3)}%` }} />
        </span>
      ) : null}
      <Cut
        id={cat.cut}
        className={cn("pointer-events-none absolute", featured ? "-right-8 -top-6 w-40" : "-bottom-2 -right-4 w-[5.8rem]")}
        style={{ transform: `rotate(${cat.tilt}deg)`, opacity: featured ? 0.95 : 1 }}
      />
    </button>
  );
}

export function DeckScreen({ situationId }: { situationId: string }) {
  const nav = useNav();
  const situation = findSituation(situationId);
  const addNote = useRod((state) => state.addNote);
  const notes = useRod((state) => state.notes);
  const [index, setIndex] = useState(() => {
    if (!situation) return 0;
    const answered = new Set(useRod.getState().notes.filter((note) => note.situationId === situation.id).map((note) => note.question));
    const first = situation.questions.findIndex((item) => !answered.has(item));
    return first < 0 ? 0 : first;
  });
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
  const cat = catOf(situation.id);
  const previous = question ? notes.find((note) => note.situationId === situation.id && note.question === question) : undefined;
  const hasText = answer.trim().length > 0;

  return (
    <ScreenFrame>
      <TopBar title={situation.title} kicker={`№ ${numberOf(situation.id)} · ${situation.play ? "Семейная игра" : "Колода"}`} onBack={nav.back} />
      {done ? (
        <section className="forest rounded-2xl p-6 pr-28" style={{ ["--forest-img" as string]: packBg("bg_8146") }}>
          <h2 className="display-title text-[2.4rem] leading-none text-paper">Колода пройдена</h2>
          <p className="hand mt-2 text-[1.6rem] leading-none text-[#c9ae74] [transform:rotate(-2deg)]">спасибо за этот разговор</p>
          <p className="mt-3 max-w-[30ch] text-paper/80">Ответы уже в книге. Если разговор зашёл далеко, соберите из них страницы.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="white" onClick={() => nav.tab({ id: "cards" })}>К накопленному</Button>
            <Button
              variant="ghost"
              className="text-paper hover:bg-paper/10"
              onClick={() => {
                setIndex(0);
                setAnswer("");
              }}
            >
              Сначала
            </Button>
          </div>
          <Cut id="moth" className="pointer-events-none absolute -right-6 -top-2 w-36 rotate-[12deg]" />
        </section>
      ) : (
        <>
          <p className="text-sm text-muted">{situation.play ? "Говорит следующий. Если не знаете, так и скажите." : situation.hint}</p>
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
                <div className="card-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl p-5 shadow-[var(--shadow-soft)] ring-1 ring-ink/10" style={{ backfaceVisibility: "hidden" }}>
                  <Cut id={cat.cut} className="pointer-events-none absolute -right-7 -top-6 w-28 opacity-90" style={{ transform: `rotate(${cat.tilt * 1.6}deg)` }} />
                  <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-ink">
                    <span className="tabular-nums">{index + 1} / {situation.questions.length}</span>
                    <span className="h-px w-5 bg-gold" />
                    <span className="max-w-[14ch] truncate">{round ?? "Вопрос"}</span>
                  </div>
                  {previous ? <span className="relative mt-2 w-fit rounded-full bg-sage-soft px-3 py-1 text-xs font-semibold text-moss">Уже отвечено</span> : null}
                  <h2 className="display-title relative mt-3 pr-16 text-[1.85rem] font-medium leading-[1.12] text-ink sm:text-4xl">{question}</h2>
                  {previous ? <p className="relative mt-2 line-clamp-2 text-sm text-muted">Было: {previous.answer}</p> : null}
                  <div className="mt-auto">
                    <p className="hand mb-1 text-[1.25rem] leading-none text-gold-ink">запиши так, как сказали</p>
                    <textarea
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      placeholder={previous ? "Дополнить ответ" : "Скажите в микрофон или впишите"}
                      className="field min-h-16 resize-none text-base"
                    />
                  </div>
                </div>
                <button type="button" onClick={() => { turnPage(); setFlipped(false); }} className="card-back absolute inset-0 flex flex-col justify-between overflow-hidden rounded-2xl p-5 text-left" style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden", ["--forest-img" as string]: packBg("bg_8153") }}>
                  <span className="hand text-[2.2rem] leading-none text-[#c9ae74]">Книга рода</span>
                  <span>
                    <span className="display-title block text-[2rem] leading-[1.05]">Откуда это известно в семье?</span>
                    <span className="mt-3 block text-sm leading-relaxed text-paper/75">{BONUS_PROMPTS.slice(0, 5).join(" · ")}</span>
                  </span>
                  <span className="text-sm text-paper/80">Нажмите, чтобы вернуться к вопросу</span>
                </button>
              </div>
            </article>
          </div>
          <div className="mx-auto mt-4 w-full max-w-sm">
            {hasText ? (
              <Button className="w-full" onClick={() => advance(1, true)}>
                Сохранить и дальше
              </Button>
            ) : (
              <button
                type="button"
                onClick={listen}
                className={cn("inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold", listening ? "bg-night text-paper" : "bg-moss text-paper")}
              >
                <Mic className="size-4" />
                {listening ? "Слушаю… остановить" : "Ответить голосом"}
              </button>
            )}
            <div className="mt-2 flex items-center justify-center gap-2">
              {hasText ? (
                <Button variant="ghost" onClick={listen}>
                  <Mic className="size-4" /> {listening ? "Остановить" : "Голосом"}
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => advance(-1, false)}>
                <SkipForward className="size-4" /> Пропустить
              </Button>
              <Button variant="ghost" onClick={() => { turnPage(); setFlipped(true); }}>
                <Lightbulb className="size-4" /> Подсказки
              </Button>
            </div>
            {index < 3 ? <p className="mt-1 text-center text-xs text-muted">Можно и смахнуть карточку: вправо оставить ответ, влево пропустить.</p> : null}
          </div>
        </>
      )}
    </ScreenFrame>
  );
}

function CardBack({ className, label }: { className?: string; label: string }) {
  return (
    <div className={cn("card-back pointer-events-none flex items-end rounded-2xl p-4", className)} style={{ ["--forest-img" as string]: packBg("bg_8153") }}>
      <p className="hand text-2xl text-[#c9ae74]">{label}</p>
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
