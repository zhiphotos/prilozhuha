import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button, Sheet } from "@/components/rod/chrome";
import { DictateButton } from "@/components/rod/dictate-button";
import { Strip } from "@/components/rod/strip";
import { aiStatus, askGenealogist, quotaLine, type AiDeps, type AiStatus } from "@/lib/rod/ai-client";
import { buildTreeContext } from "@/lib/rod/ai-context";
import { QUICK_QUESTIONS, describeFailure, newRequestId, type Failure } from "@/lib/rod/ai-helper-state";
import { API_BASE } from "@/lib/rod/config";
import { deviceId } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";
import { cn } from "@/lib/cn";

type Answer = { id: string; question: string; text: string };

/** Экран «ИИ-помощник»: вопросы по данным своей книги. Он только отвечает и подсказывает, в книге ничего не меняет.
 * Лимиты и доступ проверяет сервер; сюда приходят готовые остатки. */
export function AiHelperSheet({ onClose }: { onClose: () => void }) {
  const token = useRod((state) => state.access?.token ?? "");
  const people = useRod((state) => state.people);
  const places = useRod((state) => state.places);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const sending = useRef(false);
  const deps = (): AiDeps => ({ apiBase: API_BASE, token, deviceId: deviceId() });

  useEffect(() => {
    let alive = true;
    void aiStatus(deps()).then((result) => {
      if (!alive) return;
      if (result.ok) setStatus(result.data);
      else setFailure(describeFailure(result));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quota = status?.usage.text;
  const off = status ? !status.enabled || !status.available.text : false;
  const blocked = off || (quota ? quota.left <= 0 : false);

  const ask = async (text: string) => {
    const value = text.trim();
    if (value.length < 3 || sending.current || blocked) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    const result = await askGenealogist(deps(), value, buildTreeContext(people, places), newRequestId());
    if (result.ok) {
      setAnswers((list) => [{ id: newRequestId(), question: value, text: result.data.text }, ...list].slice(0, 5));
      setQuestion("");
      void aiStatus(deps()).then((fresh) => fresh.ok && setStatus(fresh.data));
    } else {
      setFailure(describeFailure(result));
      void aiStatus(deps()).then((fresh) => fresh.ok && setStatus(fresh.data));
    }
    sending.current = false;
    setBusy(false);
  };

  const softOff = off ? describeFailure({ ok: false, status: 503, code: "disabled", message: "" }) : null;
  const spent = !off && quota && quota.left <= 0 ? describeFailure({ ok: false, status: 429, code: "user_quota", message: "", resetAt: quota.resetAt }) : null;
  const note = failure ?? softOff ?? spent;

  return (
    <Sheet title="ИИ-помощник" onClose={onClose}>
      <div className="grid gap-4">
        <p className="text-sm leading-relaxed text-muted">Задайте вопрос о своей семье. Помощник отвечает только по тому, что записано в вашей книге, а если данных не хватает, скажет об этом. В книге он ничего не меняет.</p>

        {note ? (
          <div className={cn("glass rounded-2xl p-4 text-sm", note.kind === "limit" && "ring-1 ring-rose-deep/25")} role="status">
            <p className="font-semibold text-ink">{note.title}</p>
            <p className="mt-1 leading-relaxed text-muted">{note.text}</p>
          </div>
        ) : null}

        <Strip label="Быстрые вопросы">
          {QUICK_QUESTIONS.map((item) => (
            <button key={item.label} type="button" disabled={busy || blocked} onClick={() => void ask(item.question)} className="glass shrink-0 snap-start rounded-full px-4 py-2.5 text-sm font-medium text-ink transition active:scale-[0.98] disabled:opacity-50">
              {item.label}
            </button>
          ))}
        </Strip>

        <div className="grid gap-2">
          <textarea className="field min-h-24" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Например: кто был прадедом Анны?" disabled={blocked} maxLength={1000} aria-label="Ваш вопрос" />
          <DictateButton value={question} onChange={setQuestion} />
          <Button disabled={busy || blocked || question.trim().length < 3} onClick={() => void ask(question)}>
            <Sparkles className="size-4" aria-hidden /> {busy ? "Думаю…" : "Спросить"}
          </Button>
        </div>

        {quota && !off ? <p className="text-center text-xs text-muted">{quotaLine(quota)}</p> : null}

        {answers.map((answer) => (
          <article key={answer.id} className="glass grid gap-2 rounded-2xl p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{answer.question}</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{answer.text}</p>
            <p className="text-xs text-rose-deep">Ответ ИИ, проверьте по документам</p>
          </article>
        ))}
      </div>
    </Sheet>
  );
}
