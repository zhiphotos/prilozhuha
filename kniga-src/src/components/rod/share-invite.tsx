import { useState } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";
import { Button, Sheet } from "@/components/rod/chrome";
import { INVITE_TEXT, copyText } from "@/lib/rod/invite";

/** Кнопка-самолётик на главной и окно с приглашением. Ничего не отправляет само и не просит доступа к контактам. */
export function ShareInvite() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const close = () => {
    setOpen(false);
    setState("idle");
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full bg-moss text-paper shadow-[0_10px_24px_-14px_rgba(20,22,15,0.7)]" aria-label="Пригласить друзей" title="Пригласить друзей">
        <Send className="size-5" />
      </button>
      {open ? (
        <Sheet title="Пригласи друзей в Книгу рода" onClose={close}>
          <p className="mb-3 text-sm text-muted">Скопируй приглашение и отправь его в любом мессенджере или соцсети. Приложение само ничего не отправляет.</p>
          <textarea readOnly aria-label="Текст приглашения" value={INVITE_TEXT} className="field min-h-56 w-full text-[15px] leading-snug" onFocus={(event) => event.currentTarget.select()} />
          <div className="mt-3 grid gap-2">
            <Button
              onClick={() => {
                void copyText(INVITE_TEXT).then((ok) => setState(ok ? "copied" : "failed"));
              }}
            >
              {state === "copied" ? <Check className="size-4" /> : <Copy className="size-4" />}
              {state === "copied" ? "Скопировано" : "Скопировать приглашение"}
            </Button>
            {canShare ? (
              <Button
                variant="soft"
                onClick={() => {
                  void navigator.share({ title: "Книга рода", text: INVITE_TEXT }).catch(() => {
                    /* человек закрыл меню «Поделиться»: это не ошибка */
                  });
                }}
              >
                <Share2 className="size-4" /> Поделиться через…
              </Button>
            ) : null}
          </div>
          <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm text-ink">
            {state === "copied" ? "Приглашение скопировано целиком. Вставь его в сообщение." : state === "failed" ? "Не получилось скопировать само. Нажми на текст выше, выдели его и скопируй вручную." : ""}
          </p>
        </Sheet>
      ) : null}
    </>
  );
}
