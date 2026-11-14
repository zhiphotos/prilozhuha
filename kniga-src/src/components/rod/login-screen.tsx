import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { Cut, packBg } from "@/components/rod/botanica";
import { loginWithCode, requestLoginCode } from "@/lib/rod/pay";
import { serverStatus } from "@/lib/rod/server";
import { syncNow } from "@/lib/rod/sync";

/**
 * Экран входа в том же оформлении, что первый экран («Для кого эта книга?»): тёмная шапка с мотыльком и светлый лист.
 * Вход нужен тем, кто открыл полный доступ: по коду из письма книга подтягивается из облака. Бесплатно входить не нужно.
 */
export function LoginScreen({ onClose, onBuy }: { onClose: () => void; onBuy: () => void }) {
  const [live, setLive] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void serverStatus().then((status) => setLive(status.pay));
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const send = async () => {
    setBusy(true);
    try {
      await requestLoginCode(email.trim());
      setSent(true);
      toast("Код отправлен на почту", { duration: 5000 });
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось отправить код.", { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };
  const enter = async () => {
    setBusy(true);
    try {
      await loginWithCode(email.trim(), code);
      toast("Вы вошли. Подтягиваю книгу из облака…", { duration: 6000 });
      void syncNow("auto");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Код не подошёл.", { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-paper" role="dialog" aria-modal="true" aria-label="Вход">
      <main className="min-h-dvh">
        <header className="forest relative rounded-none px-6 pb-14 pt-[max(2.5rem,env(safe-area-inset-top))]" style={{ ["--forest-img" as string]: packBg("bg_8154") }}>
          <div className="mx-auto max-w-xl">
            <button type="button" onClick={onClose} className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm text-paper/80">
              <ChevronLeft className="size-5" /> Назад
            </button>
            <p className="hand text-[2.4rem] leading-none text-[#c9ae74]">Книга рода</p>
            <h1 className="display-title mt-4 text-[2.2rem] leading-[1.1] text-paper">Вход</h1>
            <p className="mt-3 max-w-[32ch] text-paper/75">Вход нужен тем, кто открыл полный доступ. С ним книга хранится в облаке и открывается на любом устройстве.</p>
          </div>
          <Cut id="moth" className="pointer-events-none absolute -right-8 top-16 w-44 rotate-[14deg] opacity-90" />
        </header>
        <div className="relative z-10 mx-auto -mt-6 w-full max-w-xl rounded-t-2xl bg-paper px-5 pb-12 pt-7 shadow-[var(--shadow-soft)] sm:rounded-2xl sm:px-8">
          {live === false ? (
            <p className="rounded-xl bg-blush/60 p-4 text-sm text-ink">Вход сейчас недоступен: сервер оплаты не отвечает. Книга при этом работает на этом устройстве, попробуйте войти чуть позже.</p>
          ) : null}
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (sent) void enter();
              else void send();
            }}
          >
            <label className="block">
              <span className="text-sm font-medium text-ink">Почта, которую вы указывали при оплате</span>
              <input className="field mt-1.5" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} placeholder="name@mail.ru" />
            </label>
            {sent ? (
              <label className="block">
                <span className="text-sm font-medium text-ink">Код из письма</span>
                <input className="field mt-1.5 text-center text-2xl tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                <span className="mt-1.5 block text-xs text-muted">Если письма нет, загляните в папку «Спам».</span>
              </label>
            ) : null}
            <Button type="submit" disabled={busy || (sent ? code.length !== 6 : !validEmail)} className="btn-glass-green h-auto min-h-12 w-full py-3">
              {busy ? "Подождите…" : sent ? "Войти" : "Прислать код"}
            </Button>
            {sent ? (
              <button type="button" className="min-h-11 text-left text-sm font-semibold text-moss underline underline-offset-2" disabled={busy} onClick={() => void send()}>
                Прислать код ещё раз
              </button>
            ) : null}
          </form>
          <div className="mt-8 rounded-2xl bg-white/60 p-4 text-sm text-ink">
            <p className="font-semibold">Ещё не открывали полный доступ?</p>
            <p className="mt-1 text-muted">Входить не нужно: книга хранится только в этом телефоне или браузере. Платный доступ даёт вход, облако и до трёх книг.</p>
            <button type="button" onClick={() => { onClose(); onBuy(); }} className="mt-2 min-h-11 font-semibold text-moss underline underline-offset-2">
              Что даёт полный доступ
            </button>
          </div>
        </div>
      </main>
    </div>,
    document.body,
  );
}
