import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { packBg } from "@/components/rod/botanica";
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
    <div className="login-screen fixed inset-0 z-[90] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Вход" style={{ ["--login-img" as string]: packBg("bg_8150") }}>
      <div className="login-bg" aria-hidden="true" />
      <div className="login-wall" aria-hidden="true" />
      <main className="relative z-10 mx-auto flex min-h-dvh w-full max-w-xl flex-col px-7 pb-[max(1.6rem,env(safe-area-inset-bottom))] pt-[max(1.2rem,env(safe-area-inset-top))] text-paper">
        <button type="button" onClick={onClose} className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-full px-2 text-sm text-paper/80">
          <ChevronLeft className="size-5" /> Назад
        </button>
        <h1 className="display-title mt-10 text-[4.2rem] leading-[0.95] text-paper">Вход</h1>
        <p className="mt-4 max-w-[30ch] text-[15px] leading-relaxed text-paper/80">Вход нужен тем, кто открыл полный доступ. С ним книга хранится в облаке и открывается на любом устройстве.</p>
        {live === false ? <p className="mt-4 rounded-xl bg-black/40 p-3 text-sm text-paper/90">Вход сейчас недоступен: сервер оплаты не отвечает. Книга работает на этом устройстве, попробуйте чуть позже.</p> : null}
        <form
          className="mt-8 flex flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (sent) void enter();
            else void send();
          }}
        >
          <input className="login-line" type="email" inputMode="email" autoComplete="email" aria-label="Почта, которую вы указывали при оплате" value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} placeholder="Почта при оплате" />
          {sent ? (
            <>
              <input className="login-line mt-3 tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} aria-label="Код из письма" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Код из письма" />
              <p className="mt-2 text-xs text-paper/70">Если письма нет, загляните в папку «Спам».</p>
              <button type="button" className="mt-2 min-h-11 w-fit text-sm text-paper underline underline-offset-4" disabled={busy} onClick={() => void send()}>
                Прислать код ещё раз
              </button>
            </>
          ) : null}
          <div className="mt-auto pt-10">
            <button type="submit" disabled={busy || (sent ? code.length !== 6 : !validEmail)} className="login-btn">
              {busy ? "Подождите…" : sent ? "Войти" : "Прислать код"}
            </button>
            <p className="mt-4 text-center text-[12px] leading-relaxed text-paper/70">
              Бесплатно входить не нужно: книга хранится в этом телефоне.
              <br />
              <button type="button" onClick={() => { onClose(); onBuy(); }} className="text-paper underline underline-offset-4">
                Что даёт полный доступ
              </button>
            </p>
          </div>
        </form>
      </main>
    </div>,
    document.body,
  );
}
