import { useEffect, useState } from "react";
import { Cloud } from "lucide-react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { loginWithCode, requestLoginCode } from "@/lib/rod/pay";
import { serverStatus } from "@/lib/rod/server";
import { syncNow } from "@/lib/rod/sync";

/**
 * Вход по почте на новом устройстве: для тех, кто уже оплатил программу. Код приходит на почту оплаты, пароль не нужен.
 * После входа книга сама подтягивается из облака (синхронизация включена у всех с оплаченным доступом).
 */
export function CloudLoginButton({ className }: { className?: string }) {
  const [live, setLive] = useState(false);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void serverStatus().then((status) => setLive(status.pay));
  }, []);
  if (!live) return null;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  const close = () => {
    setOpen(false);
    setSent(false);
    setCode("");
  };
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
      close();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Код не подошёл.", { duration: 7000 });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={className ?? "inline-flex min-h-11 items-center gap-2 rounded-full border border-ink/20 px-4 text-sm font-semibold text-ink"} onClick={() => setOpen(true)}>
        <Cloud className="size-4" /> Войти по почте
      </button>
      {open ? (
        <Sheet title="Вход по почте" onClose={close}>
          <p className="text-sm text-muted">Для тех, кто уже оплатил программу. Впишите почту, которую указывали при оплате: на неё придёт письмо с шестью цифрами. Пароль не нужен. После входа ваша книга появится на этом устройстве сама.</p>
          <form
            className="mt-4 grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (sent) void enter();
              else void send();
            }}
          >
            <input className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setSent(false); }} placeholder="name@mail.ru" />
            {sent ? (
              <>
                <p className="text-sm text-ink">Код отправлен. Если письма нет, загляните в папку «Спам».</p>
                <input className="field text-center text-2xl tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
                <Button type="submit" disabled={busy || code.length !== 6} className="h-auto min-h-12 w-full py-3">{busy ? "Проверяю…" : "Войти"}</Button>
                <button type="button" className="text-left text-sm text-moss underline" disabled={busy} onClick={() => void send()}>Прислать код ещё раз</button>
              </>
            ) : (
              <Button type="submit" disabled={busy || !validEmail} className="h-auto min-h-12 w-full py-3">{busy ? "Отправляю…" : "Прислать код"}</Button>
            )}
          </form>
        </Sheet>
      ) : null}
    </>
  );
}
