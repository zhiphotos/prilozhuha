import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { MAX_INTERVIEW } from "@/lib/rod/ask-link";
import { sendCustomInterview, sendInterview, sendQuestion } from "@/lib/rod/ask-relative";
import type { Situation } from "@/lib/rod/content";
import { useRod } from "@/lib/rod/store";
import { cn } from "@/lib/cn";

/** Отправка родственнику: один вопрос или собранное интервью из колоды. Платным. */
export function SendInterviewSheet({ situation, index, onClose }: { situation: Situation; index: number; onClose: () => void }) {
  const notes = useRod((state) => state.notes);
  const [mode, setMode] = useState<"one" | "set" | "own">("one");
  const [busy, setBusy] = useState(false);
  const answered = useMemo(() => new Set(notes.filter((n) => n.situationId === situation.id).map((n) => n.question)), [notes, situation.id]);
  const next = (count: number) => {
    const out = new Set<number>();
    for (let i = index; i < situation.questions.length && out.size < count; i += 1) if (!answered.has(situation.questions[i]!)) out.add(i);
    return out;
  };
  const [picked, setPicked] = useState<Set<number>>(() => next(10));
  const toggle = (i: number) =>
    setPicked((cur) => {
      const copy = new Set(cur);
      if (copy.has(i)) copy.delete(i);
      else if (copy.size < MAX_INTERVIEW) copy.add(i);
      else toast(`Можно отправить до ${MAX_INTERVIEW} вопросов за раз`);
      return copy;
    });

  const done = (mode2: "shared" | "copied" | "cancelled") => {
    if (mode2 === "shared") {
      toast("Отправлено. Ответы придут к вам во входящие.");
      onClose();
    } else if (mode2 === "copied") {
      toast("Текст со ссылкой скопирован: вставьте его в сообщение родственнику.");
      onClose();
    }
  };
  const fail = (error: unknown) => toast(error instanceof Error ? error.message : "Не получилось отправить.", { duration: 6000 });

  const sendOne = () => {
    setBusy(true);
    void sendQuestion(situation.questions[index]!).then(done).catch(fail).finally(() => setBusy(false));
  };
  const sendSet = () => {
    if (!picked.size) return;
    setBusy(true);
    void sendInterview({ kind: "deck", id: situation.id, idx: [...picked] }, situation.title, picked.size).then(done).catch(fail).finally(() => setBusy(false));
  };

  const tab = (id: "one" | "set" | "own", label: string) => (
    <button type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={cn("min-h-11 flex-1 rounded-full border px-3 text-sm font-semibold", mode === id ? "border-moss bg-moss text-paper" : "border-ink/20 text-ink")}>
      {label}
    </button>
  );

  return (
    <Sheet title="Отправить родственнику" onClose={onClose}>
      <div className="flex gap-2" role="tablist">
        {tab("one", "Один вопрос")}
        {tab("set", "Из колоды")}
        {tab("own", "Своё")}
      </div>
      {mode === "own" ? <CustomInterviewForm onDone={onClose} /> : null}
      {mode === "one" ? (
        <div className="mt-4">
          <p className="rounded-2xl bg-ink/5 p-4 text-lg font-semibold leading-snug text-ink">{situation.questions[index]}</p>
          <p className="mt-2 text-sm text-ink/70">Родственник получит ссылку, ответит у себя, а ответ придёт к вам.</p>
          <Button className="mt-4 w-full" disabled={busy} onClick={sendOne}>{busy ? "Готовлю…" : "Отправить вопрос"}</Button>
        </div>
      ) : mode === "set" ? (
        <div className="mt-4">
          <p className="text-sm text-ink/75">Отметьте вопросы из колоды «{situation.title}»: родственник получит их одним интервью (до {MAX_INTERVIEW}).</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-full border border-ink/20 px-4 text-sm font-semibold" onClick={() => setPicked(next(10))}>Следующие 10</button>
            <button type="button" className="min-h-11 rounded-full border border-ink/20 px-4 text-sm font-semibold" onClick={() => setPicked(next(MAX_INTERVIEW))}>Сразу {MAX_INTERVIEW}</button>
            <button type="button" className="min-h-11 rounded-full px-4 text-sm font-semibold text-ink/70 underline" onClick={() => setPicked(new Set())}>Снять все</button>
          </div>
          <ul className="mt-3 grid max-h-[40dvh] gap-1.5 overflow-y-auto pr-1">
            {situation.questions.map((q, i) => (
              <li key={q}>
                <button type="button" aria-pressed={picked.has(i)} onClick={() => toggle(i)} className={cn("flex min-h-12 w-full items-start gap-3 rounded-2xl border px-3 py-2 text-left", picked.has(i) ? "border-moss bg-sage-soft/50" : "border-ink/15 bg-white/60")}>
                  <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border text-xs", picked.has(i) ? "border-moss bg-moss text-paper" : "border-ink/30")}>{picked.has(i) ? "✓" : ""}</span>
                  <span className="text-[15px] leading-snug text-ink">{q}{answered.has(q) ? <span className="ml-1 text-xs text-ink/60">(уже отвечено)</span> : null}</span>
                </button>
              </li>
            ))}
          </ul>
          <Button className="mt-4 w-full" disabled={busy || !picked.size} onClick={sendSet}>{busy ? "Готовлю…" : `Отправить интервью (${picked.size})`}</Button>
        </div>
      ) : null}
    </Sheet>
  );
}

/** Своё интервью: название и вопросы вписывает сама владелица, по одному в строку. Родственнику уходит короткая ссылка. */
export function CustomInterviewForm({ onDone }: { onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<string[]>(["", "", ""]);
  const [busy, setBusy] = useState(false);
  const filled = rows.map((r) => r.trim()).filter((r) => r.length >= 3);
  const setRow = (i: number, value: string) => setRows((cur) => cur.map((r, n) => (n === i ? value : r)));
  const send = () => {
    if (!filled.length) return;
    setBusy(true);
    void sendCustomInterview(title.trim() || "Интервью", filled)
      .then((mode) => {
        if (mode === "shared") toast("Отправлено. Ответы придут к вам во входящие.");
        else if (mode === "copied") toast("Текст со ссылкой скопирован: вставьте его в сообщение родственнику.");
        if (mode !== "cancelled") onDone();
      })
      .catch((error) => toast(error instanceof Error ? error.message : "Не получилось отправить.", { duration: 6000 }))
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-4 grid gap-3">
      <label className="grid gap-1 text-sm font-semibold text-ink">
        Для кого или о чём интервью
        <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например, Про деда Ивана" maxLength={80} />
      </label>
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-ink">Ваши вопросы</p>
        {rows.map((row, i) => (
          <textarea key={i} className="field min-h-14 text-base" rows={2} value={row} onChange={(e) => setRow(i, e.target.value)} placeholder={i === 0 ? "Например, как вы с бабушкой познакомились?" : "Ещё вопрос"} maxLength={400} />
        ))}
        {rows.length < 40 ? (
          <button type="button" className="min-h-11 rounded-full border border-ink/20 px-4 text-sm font-semibold text-ink" onClick={() => setRows((cur) => [...cur, ""])}>
            + Ещё вопрос
          </button>
        ) : null}
      </div>
      <Button disabled={busy || !filled.length} onClick={send} className="w-full">
        {busy ? "Готовлю…" : filled.length ? `Отправить интервью (${filled.length})` : "Впишите хотя бы один вопрос"}
      </Button>
    </div>
  );
}

/** Окно «Составить своё интервью» (с «Главной»). */
export function CustomInterviewSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Своё интервью для родственника" onClose={onClose}>
      <p className="text-sm text-ink/75">Впишите свои вопросы. Родственник получит ссылку, ответит на них у себя, а готовые ответы придут к вам.</p>
      <CustomInterviewForm onDone={onClose} />
    </Sheet>
  );
}
