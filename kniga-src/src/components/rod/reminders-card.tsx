import { useEffect, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";
import { serverStatus } from "@/lib/rod/server";
import { DAY_CHOICES, disablePush, enablePush, pushPrefs, pushSupport } from "@/lib/rod/push";
import { Button } from "@/components/rod/chrome";

const HOURS = [9, 12, 18, 19, 20, 21];

/** Тихий двойной звон «динь-дон», когда напоминания включились. Без файлов: рисуем звук сами. */
function chime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [[880, 0], [659.25, 0.28]].forEach(([freq, at]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 1.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 1.2);
    });
    window.setTimeout(() => void ctx.close(), 2000);
  } catch {
    /* звук необязателен */
  }
}

/** Мягкие напоминания: не чаще одного в день, по выбранным дням и в выбранный час, и ни одного, если человек сегодня уже заходил. */
export function RemindersCard() {
  const [prefs, setPrefs] = useState(pushPrefs);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => {
    void serverStatus().then((status) => setLive(status.push));
  }, []);
  const support = live ? pushSupport() : "no-server";
  const days = DAY_CHOICES.find((choice) => choice.days.join() === prefs.days.join()) ?? DAY_CHOICES[0];

  const run = async (job: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await job();
      setPrefs(pushPrefs());
      toast(ok);
      if (pushPrefs().on) chime();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось.", { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const note =
    support === "no-server"
      ? "Появится, когда подключится сервер приложения."
      : support === "need-install"
        ? "На iPhone напоминания работают у приложения на экране «Домой»: нажмите «Поделиться» → «На экран Домой» и откройте книгу оттуда."
        : support === "unsupported"
          ? "Этот браузер не умеет показывать напоминания."
          : support === "denied"
            ? "Уведомления запрещены в настройках телефона. Разрешите их для этого сайта."
            : "Раз в пару дней мягкая подсказка: один вопрос, одна история, один шаг. Без спама и без вины.";

  return (
    <section className="glass mt-6 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        <Bell className="size-3.5" /> Напоминания
      </h2>
      {prefs.on && support === "ok" ? (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-[#e8eedd] p-3">
          <span className="bell-ring grid size-11 shrink-0 place-items-center rounded-full bg-[#3f4a22] text-[#e6cf9c]" aria-hidden="true">
            <BellRing className="size-5" />
          </span>
          <div>
            <p className="text-[1.05rem] font-semibold leading-tight text-ink">Уведомления включены, они работают</p>
            <p className="mt-0.5 text-sm text-ink/75">Приходят {days.label.toLowerCase()} в {prefs.hour}:00. Мягкий звон «динь-дон», не чаще раза в день.</p>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[1.2rem] font-semibold leading-tight text-ink">{prefs.on ? `Приходят ${days.label.toLowerCase()} в ${prefs.hour}:00` : "Чтобы книга двигалась"}</p>
          <p className="mt-1 text-sm text-muted">{note}</p>
        </>
      )}
      {support === "ok" ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <select className="field" value={prefs.hour} onChange={(event) => setPrefs({ ...prefs, hour: Number(event.target.value) })} aria-label="Время">
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  в {hour}:00
                </option>
              ))}
            </select>
            <select className="field" value={days.label} onChange={(event) => setPrefs({ ...prefs, days: DAY_CHOICES.find((choice) => choice.label === event.target.value)?.days ?? prefs.days })} aria-label="Как часто">
              {DAY_CHOICES.map((choice) => (
                <option key={choice.label}>{choice.label}</option>
              ))}
            </select>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void run(() => enablePush(prefs.hour, prefs.days), prefs.on ? "Сохранено" : "Уведомления включены, они работают")}>
              {prefs.on ? "Сохранить" : "Включить напоминания"}
            </Button>
            {prefs.on ? (
              <Button variant="ghost" disabled={busy} onClick={() => void run(disablePush, "Напоминания выключены")}>
                Выключить
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
