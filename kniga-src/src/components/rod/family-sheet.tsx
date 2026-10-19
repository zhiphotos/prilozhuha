import { useCallback, useEffect, useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { accept, createRoom, dismiss, fetchInbox, inviteLink, rotateInvite, type Incoming } from "@/lib/rod/family";
import { useRod } from "@/lib/rod/store";
import { useMedia } from "@/lib/rod/media";
import { Button, Sheet } from "@/components/rod/chrome";

const KIND = { story: "Воспоминание", answer: "Ответ на вопрос", photo: "Фото" } as const;

/** Владелец: ссылка для родственников и то, что они прислали. Принятое попадает в семейный архив. */
export function FamilySheet({ onClose }: { onClose: () => void }) {
  const room = useRod((state) => state.room);
  const dedicatee = useRod((state) => state.dedicatee);
  const [items, setItems] = useState<Incoming[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    void fetchInbox().then(setItems).catch(() => setItems([]));
  }, []);
  useEffect(() => {
    if (room) load();
  }, [room, load]);

  const link = room ? inviteLink(room) : "";
  const message = `Помогите мне собрать семейную книгу: расскажите, что помните, или пришлите старое фото. Ничего устанавливать не нужно: ${link}`;

  const run = async (job: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await job();
      if (ok) toast(ok);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось.", { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Семья" onClose={onClose}>
      {!room ? (
        <>
          <p className="text-sm text-muted">Пригласите родственников помогать с книгой. Они получат ссылку, откроют её в телефоне без установки и пришлют воспоминание, ответ на вопрос или старое фото. Всё придёт к вам, а вы решите, что взять в книгу. А им мы заодно покажем бесплатный урок и предложим сделать такую же книгу про свою семью.</p>
          <Button className="mt-4 w-full" disabled={busy} onClick={() => void run(() => createRoom(dedicatee.trim() ? `Семья: ${dedicatee.trim()}` : "Наша семья"), "Ссылка готова")}>
            {busy ? "Создаю…" : "Создать ссылку для родственников"}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">Отправьте эту ссылку маме, бабушке, тёте. Они откроют её без установки и ответят на вопросы или пришлют фото.</p>
          <p className="mt-3 break-all rounded-2xl bg-white/70 p-3 text-xs text-ink">{link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (navigator.share) void navigator.share({ title: "Семейная книга", text: message }).catch(() => undefined);
                else void navigator.clipboard.writeText(message).then(() => toast("Приглашение скопировано"));
              }}
            >
              <Share2 className="size-4" /> Отправить
            </Button>
            <Button variant="soft" onClick={() => void navigator.clipboard.writeText(link).then(() => toast("Ссылка скопирована"))}>
              <Copy className="size-4" /> Копировать
            </Button>
          </div>
          <button type="button" className="mt-3 text-left text-xs text-muted underline" disabled={busy} onClick={() => void run(rotateInvite, "Новая ссылка готова, старая больше не работает")}>
            Ссылка попала не туда? Сделать новую
          </button>

          <h3 className="mt-6 text-base font-semibold text-ink">Прислали родственники</h3>
          {items === null ? <p className="mt-2 text-sm text-muted">Смотрю…</p> : null}
          {items?.length === 0 ? <p className="mt-2 text-sm text-muted">Пока ничего. Когда кто-то ответит, это появится здесь.</p> : null}
          <ul className="mt-2 grid gap-2.5">
            {items?.map((item) => (
              <li key={item.id} className="rounded-2xl bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gold-ink">
                  {KIND[item.kind]} · {item.from.name}
                  {item.from.relation ? `, ${item.from.relation}` : ""}
                </p>
                {item.title || item.question ? <p className="mt-1 text-sm font-semibold text-ink">{item.title || item.question}</p> : null}
                {item.photo ? <Photo src={item.photo} /> : null}
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink/85">{item.text}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await accept(item);
                        await dismiss([item.id]);
                        setItems((list) => list?.filter((x) => x.id !== item.id) ?? null);
                      }, "Добавлено в семейный архив")
                    }
                  >
                    Взять в книгу
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await dismiss([item.id]);
                        setItems((list) => list?.filter((x) => x.id !== item.id) ?? null);
                      })
                    }
                  >
                    Убрать
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function Photo({ src }: { src: string }) {
  const url = useMedia(src.startsWith("data:") ? undefined : src);
  return <img src={src.startsWith("data:") ? src : url} alt="" className="mt-2 max-h-56 rounded-xl" />;
}
