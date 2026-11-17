import { useRef, useState } from "react";
import { Lightbulb, Mic, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { Cut } from "@/components/rod/botanica";
import { Button } from "@/components/rod/chrome";
import { recognition, type SpeechRec } from "@/lib/rod/speech";
import { turnPage } from "@/lib/rod/sounds";
import { cn } from "@/lib/cn";

/** Картинки для карточек: каждый вопрос получает свою из набора, угол и наклон меняются. Выглядит случайно, но на одном вопросе всегда одинаково. */
const DECOR = ["peony", "lily_valley", "rosebuds", "daffodil", "rose", "moth", "branch", "shell", "stick_green", "lotus_pod", "wood_slice", "engraving_circle", "stick_rosehip", "lace/lace_18_t", "lace/lace_14_t", "lace/lace_33_t"];
const decorOf = (i: number) => {
  const id = DECOR[(i * 7 + 3) % DECOR.length]!;
  const tilt = ((i * 37) % 41) - 20;
  const size = ["w-24", "w-28", "w-32"][i % 3]!;
  return { id, tilt, size };
};

export type InterviewQuestion = { key: string; text: string; hint?: string };

/** Интервью карточками: один вопрос за раз, как в колодах. Можно ответить голосом, записать, пропустить. В конце ответы уходят хозяйке книги. */
export function InterviewCards({ title, questions, busy, onSend }: { title: string; questions: InterviewQuestion[]; busy: boolean; onSend: (answers: Record<string, string>) => void }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [listening, setListening] = useState(false);
  const recRef = useRef<SpeechRec | null>(null);
  const total = questions.length;
  const done = index >= total;
  const q = questions[index];
  const text = q ? (answers[q.key] ?? "") : "";
  const answeredCount = questions.filter((item) => (answers[item.key] ?? "").trim().length > 1).length;

  const stopMic = () => {
    recRef.current?.stop();
    setListening(false);
  };
  const go = (to: number) => {
    stopMic();
    turnPage();
    setIndex(Math.max(0, Math.min(total, to)));
  };
  const setText = (value: string) => q && setAnswers((cur) => ({ ...cur, [q.key]: value }));

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
    const base = text.trim();
    rec.lang = "ru-RU";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let said = "";
      for (let i = 0; i < event.results.length; i += 1) said += event.results[i]?.[0]?.transcript ?? "";
      setText(`${base} ${said}`.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  if (done) {
    return (
      <section className="forest mt-2 rounded-2xl p-6">
        <h2 className="display-title text-[1.8rem] leading-none text-paper">Спасибо!</h2>
        <p className="hand mt-2 text-[1.6rem] leading-none text-[#c9ae74]">это очень важно для книги</p>
        <p className="mt-3 text-paper/85">{answeredCount ? `Готово ответов: ${answeredCount}. Нажмите, чтобы отправить их в книгу.` : "Вы пока никому не ответили. Можно вернуться к вопросам."}</p>
        <div className="mt-5 grid gap-2">
          <Button variant="white" disabled={busy || !answeredCount} onClick={() => onSend(answers)}>
            {busy ? "Отправляю…" : answeredCount ? `Отправить ответы (${answeredCount})` : "Отправить ответы"}
          </Button>
          <Button variant="ghost" className="text-paper hover:bg-paper/10" onClick={() => go(0)}>К вопросам с начала</Button>
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="card-stage relative mx-auto mt-2 w-full max-w-sm" style={{ perspective: "1000px" }}>
        <div className="card-back pointer-events-none absolute inset-x-8 top-6 bottom-0 scale-90 rounded-2xl opacity-50" />
        <div className="card-back pointer-events-none absolute inset-x-4 top-3 bottom-0 scale-95 rounded-2xl opacity-80" />
        <article className="card-face absolute inset-0 flex flex-col overflow-hidden rounded-2xl p-5 shadow-[var(--shadow-soft)] ring-1 ring-ink/10">
          <Cut id={decorOf(index).id} className={cn("pointer-events-none absolute -right-7 -top-6 opacity-90", decorOf(index).size)} style={{ transform: `rotate(${decorOf(index).tilt}deg)` }} />
          <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold-ink">
            <span className="tabular-nums">{index + 1} / {total}</span>
            <span className="h-px w-5 bg-gold" />
            <span className="max-w-[24ch] truncate">{title}</span>
          </div>
          <h2 className="relative mt-3 pr-14 text-[1.6rem] font-semibold leading-[1.15] text-ink">{q?.text}</h2>
          <div className="mt-auto">
            <p className="hand mb-1 text-[1.25rem] leading-tight text-gold-ink">что первое пришло в голову, то и скажите</p>
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder={q?.hint || "Скажите в микрофон или впишите"} className="field min-h-16 resize-none text-base" />
          </div>
        </article>
      </div>
      <div className="mx-auto mt-4 w-full max-w-sm">
        {text.trim() ? (
          <Button className="w-full" onClick={() => go(index + 1)}>
            Сохранить и дальше
          </Button>
        ) : (
          <button type="button" onClick={listen} className={cn("inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold", listening ? "bg-night text-paper" : "bg-moss text-paper")}>
            <Mic className="size-4" />
            {listening ? "Слушаю… остановить" : "Ответить голосом"}
          </button>
        )}
        <div className="mt-2 flex items-center justify-center gap-2">
          {text.trim() ? (
            <Button variant="ghost" onClick={listen}>
              <Mic className="size-4" /> {listening ? "Остановить" : "Голосом"}
            </Button>
          ) : null}
          {index > 0 ? (
            <Button variant="ghost" onClick={() => go(index - 1)}>
              Назад
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => go(index + 1)}>
            <SkipForward className="size-4" /> Пропустить
          </Button>
        </div>
        {answeredCount ? (
          <p className="mt-1 flex items-center justify-center gap-1 text-center text-xs text-muted">
            <Lightbulb className="size-3" /> Отвечено: {answeredCount}. Отправка в конце.
          </p>
        ) : null}
      </div>
    </div>
  );
}
