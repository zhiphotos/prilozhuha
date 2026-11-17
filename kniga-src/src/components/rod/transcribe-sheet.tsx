import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { aiStatus, quotaLine, transcribeChunk, type AiDeps, type AiQuota } from "@/lib/rod/ai-client";
import { CHUNK_SEC, RATE, clock, decodeMono16k, encodeWav, findCuts, shiftSegments, toBase64, type Seg } from "@/lib/rod/audio-chunks";
import { API_BASE } from "@/lib/rod/config";
import { deviceId } from "@/lib/rod/pay";
import { useRod } from "@/lib/rod/store";

/** Остаток минут расшифровки для человека: null, пока не узнали или если расшифровка не подключена. */
export function useMinutes(): AiQuota | null {
  const access = useRod((s) => s.access);
  const [quota, setQuota] = useState<AiQuota | null>(null);
  useEffect(() => {
    if (!access?.token || !API_BASE) return;
    let live = true;
    void aiStatus({ apiBase: API_BASE, token: access.token, deviceId: deviceId() }).then((status) => {
      if (live && status.ok && status.data.enabled && status.data.available.audio_min) setQuota(status.data.usage.audio_min);
    });
    return () => {
      live = false;
    };
  }, [access?.token]);
  return quota;
}

/** «Осталось 240 из 300 минут. Обновится 1 декабря.» */
export const minutesLine = (quota: AiQuota) => quotaLine(quota).replace(/^Осталось (\d+) из (\d+)\./, (_m, left, limit) => `Осталось ${left} из ${limit} минут в этом месяце.`);

type Phase = "idle" | "reading" | "ready" | "working" | "paused" | "done";

/** Расшифровка интервью: файл режется на куски по минуте, куски расшифровываются по очереди, готовый текст можно поправить и сохранить историей. */
export function TranscribeSheet({ onClose }: { onClose: () => void }) {
  const addStory = useRod((s) => s.addStory);
  const access = useRod((s) => s.access);
  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [segs, setSegs] = useState<Seg[]>([]);
  const [text, setText] = useState("");
  const [quota, setQuota] = useState<AiQuota | null>(null);
  const [withTime, setWithTime] = useState(true);
  const audio = useRef<{ samples: Float32Array; cuts: number[] } | null>(null);
  const stop = useRef(false);
  const minutes = useMinutes();
  const shownQuota = quota ?? minutes;
  const deps = (): AiDeps => ({ apiBase: API_BASE, token: access?.token ?? "", deviceId: deviceId() });

  const pick = async (file: File) => {
    setPhase("reading");
    setName(file.name.replace(/\.[^.]+$/, ""));
    setNote("Читаю запись…");
    try {
      const samples = await decodeMono16k(file);
      audio.current = { samples, cuts: findCuts(samples) };
      setTotal(audio.current.cuts.length);
      setDone(0);
      setSegs([]);
      const status = await aiStatus(deps());
      if (status.ok) {
        if (!status.data.enabled || !status.data.available.audio_min) {
          setNote("Расшифровка пока не подключена. Скоро включу.");
          setPhase("idle");
          return;
        }
        setQuota(status.data.usage.audio_min);
      }
      setNote(`Длина записи: ${clock(samples.length / RATE)}. Расшифровка займёт примерно столько минут из вашего лимита: ${Math.ceil(samples.length / RATE / 60)}.`);
      setPhase("ready");
    } catch {
      setNote("Не получилось прочитать запись. Если она очень длинная (больше часа), разрежьте её на части и расшифруйте по очереди.");
      setPhase("idle");
    }
  };

  const run = async () => {
    const data = audio.current;
    if (!data) return;
    stop.current = false;
    setPhase("working");
    let at = done;
    const all = [...segs];
    for (; at < data.cuts.length; at += 1) {
      if (stop.current) {
        setPhase("paused");
        setNote("Остановлено. Можно продолжить с того же места.");
        return;
      }
      const from = at === 0 ? 0 : data.cuts[at - 1]!;
      const part = data.samples.subarray(from, data.cuts[at]!);
      const seconds = Math.max(1, Math.round(part.length / RATE));
      const wav = toBase64(encodeWav(part));
      let answer = await transcribeChunk(deps(), wav, seconds, `${name}:${at}:${from}`);
      // Один повтор при сбое связи; остальное сервер вернёт честным отказом (лимит, квота).
      if (!answer.ok && answer.code === "network") answer = await transcribeChunk(deps(), wav, seconds, `${name}:${at}:${from}:r`);
      if (!answer.ok) {
        setNote(`${answer.message} Уже готовое сохранено: ${at} из ${data.cuts.length} кусков.`);
        setPhase("paused");
        return;
      }
      all.push(...shiftSegments(answer.data.segments?.length ? answer.data.segments : [{ start: 0, end: seconds, text: answer.data.text }], from / RATE));
      setSegs([...all]);
      setDone(at + 1);
      setQuota((q) => (q ? { ...q, left: answer.data.left } : q));
    }
    setPhase("done");
    setNote("Готово. Прочитайте и поправьте текст: имена и названия мест ИИ мог написать не так.");
  };

  const joined = (marks: boolean) => segs.map((s) => (marks ? `[${clock(s.start)}] ${s.text}` : s.text)).join(marks ? "\n" : " ");
  const shown = text || joined(withTime);

  return (
    <Sheet title="Расшифровать интервью" onClose={onClose}>
      <div className="grid gap-3 pb-2">
        <p className="text-sm text-muted">Выберите запись разговора (аудио или видео). Я перепишу её в текст с отметками времени. Запись остаётся у вас, в облако уходят только небольшие куски звука для расшифровки.</p>
        {phase === "idle" || phase === "reading" ? (
          <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-moss px-4 font-semibold text-paper">
            {phase === "reading" ? "Читаю…" : "Выбрать запись"}
            <input type="file" accept="audio/*,video/*" className="sr-only" disabled={phase === "reading"} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} />
          </label>
        ) : null}
        <p className="rounded-2xl bg-ink/5 px-3 py-2 text-sm text-ink">
          Расшифровка входит в программу: до 300 минут записи в месяц на человека. {shownQuota ? minutesLine(shownQuota) : ""}
        </p>
        {note ? <p role="status" className="text-sm text-ink">{note}</p> : null}
        {phase === "ready" || phase === "paused" ? (
          <Button onClick={() => void run()}>{phase === "paused" ? "Продолжить" : "Расшифровать"}</Button>
        ) : null}
        {phase === "working" ? (
          <>
            <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-moss transition-all" style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            <p className="text-sm text-muted">Кусок {Math.min(done + 1, total)} из {total}. Не закрывайте приложение.</p>
            <Button variant="soft" onClick={() => { stop.current = true; }}>Остановить</Button>
          </>
        ) : null}
        {segs.length ? (
          <>
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-5" checked={withTime} onChange={(e) => { setWithTime(e.target.checked); setText(""); }} />
              С отметками времени
            </label>
            <textarea className="field min-h-64 w-full text-[15px] leading-snug" value={shown} onChange={(e) => setText(e.target.value)} aria-label="Расшифровка" />
            <div className="grid gap-2">
              <Button
                disabled={phase === "working"}
                onClick={() => {
                  addStory({ templateId: "free", title: name || "Расшифровка интервью", answers: {}, narrative: shown.trim() });
                  toast("Сохранила в «Истории»");
                  onClose();
                }}
              >
                Сохранить в «Истории»
              </Button>
              <Button variant="soft" onClick={() => void navigator.clipboard?.writeText(shown).then(() => toast("Скопировано"))}>Скопировать текст</Button>
            </div>
          </>
        ) : null}
        <p className="text-xs text-muted">Куски по {CHUNK_SEC} секунд. Если запись длиннее часа, телефону может не хватить памяти: разрежьте её на части.</p>
      </div>
    </Sheet>
  );
}
