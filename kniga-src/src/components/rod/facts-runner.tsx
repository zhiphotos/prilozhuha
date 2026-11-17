import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { extractFactsChunk, type AiDeps } from "@/lib/rod/ai-client";
import { API_BASE } from "@/lib/rod/config";
import { chunkText, foundLine, runExtraction, stripMarks } from "@/lib/rod/interview-facts";
import { deviceId } from "@/lib/rod/pay";
import { plural } from "@/lib/rod/progress";
import { useRod } from "@/lib/rod/store";

const uid = () => crypto.randomUUID();

/** Кнопка и ход «Найти главное в интервью». Используется и в окне расшифровки, и внутри папки. Уже найденное сохраняется после каждого куска. */
export function FactsRunner({ interviewId }: { interviewId: string }) {
  const interview = useRod((s) => s.interviews.find((i) => i.id === interviewId));
  const access = useRod((s) => s.access);
  const update = useRod((s) => s.updateInterview);
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState("");
  const stop = useRef(false);
  if (!interview) return null;
  const chunks = chunkText(stripMarks(interview.text)).length;
  const partial = interview.factsTotal > 0 && interview.factsDone < interview.factsTotal;
  const finished = interview.factsTotal > 0 && !partial;
  const deps = (): AiDeps => ({ apiBase: API_BASE, token: access?.token ?? "", deviceId: deviceId() });

  const run = async (from: number) => {
    stop.current = false;
    setWorking(true);
    setNote("Читаю интервью…");
    const start = useRod.getState().interviews.find((i) => i.id === interviewId);
    if (!start) return;
    update(interviewId, { factsTotal: chunks, factsDone: from });
    const result = await runExtraction(
      start,
      {
        call: (text, requestId, context) => extractFactsChunk(deps(), text, requestId, context),
        makeId: uid,
        stopped: () => stop.current,
        onProgress: (p) => {
          update(interviewId, { facts: p.facts, factsDone: p.done, factsTotal: p.total, dropped: p.dropped });
          setNote(`${foundLine(p.facts)}… (кусок ${p.done} из ${p.total})`);
        },
      },
      from,
    );
    update(interviewId, { facts: result.facts, factsDone: result.done, factsTotal: result.total, dropped: result.dropped });
    setWorking(false);
    if (result.paused) setNote(`Остановила. ${foundLine(result.facts)}. Можно продолжить с того же места.`);
    else if (result.error) setNote(`${result.error.message} ${foundLine(result.facts)}. Найденное сохранено, продолжу с того же места.`);
    else {
      setNote(`Готово. ${foundLine(result.facts)}.${result.dropped ? ` Ещё ${plural(result.dropped, "находку", "находки", "находок")} отбросила: в тексте не нашлось подтверждающих слов.` : ""} Просмотрите карточки: что неясно, помечено.`);
      toast("Нашла главное в интервью");
    }
  };

  return (
    <div className="grid gap-2">
      {!working ? (
        <label className="grid gap-1">
          <span className="text-sm font-semibold">О чём эта запись (подскажите ИИ)</span>
          <textarea
            rows={3}
            maxLength={400}
            value={interview.context ?? ""}
            onChange={(e) => update(interviewId, { context: e.target.value })}
            placeholder="Например: я разговариваю с бабушкой. Бабушка рассказывает истории о детстве, семье, работе, увлечениях. Нужны все её рассказы, места и занятия."
            className="w-full rounded-xl border border-ink/20 bg-paper p-3 text-base"
          />
        </label>
      ) : null}
      {working ? (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-moss transition-all" style={{ width: `${interview.factsTotal ? (interview.factsDone / interview.factsTotal) * 100 : 0}%` }} /></div>
          <Button variant="soft" onClick={() => { stop.current = true; }}>Остановить</Button>
        </>
      ) : (
        <Button onClick={() => void run(partial ? interview.factsDone : 0)} disabled={!interview.text.trim()}>
          {partial ? "Продолжить поиск" : finished ? "Найти заново" : "Найти главное в интервью"}
        </Button>
      )}
      {note ? <p role="status" className="text-sm text-ink">{note}</p> : null}
      {!note && !working ? <p className="text-xs text-muted">Я выпишу людей, места, даты, события и вещи, и к каждому факту приложу слова из записи. Расход: {plural(chunks, "обращение", "обращения", "обращений")} к ИИ из месячного запаса, минуты расшифровки не тратятся.</p> : null}
    </div>
  );
}

