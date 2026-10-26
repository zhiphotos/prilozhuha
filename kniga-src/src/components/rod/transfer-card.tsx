import { useState } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { OpenCopyButton } from "@/components/rod/open-copy";
import { exportBook } from "@/lib/rod/backup";
import { syncNow, useSync } from "@/lib/rod/sync";

/** Для тех, у кого открыта программа: перенести книгу на второй телефон или компьютер. Это перенос копии, а не постоянная синхронизация. */
export function TransferCard({ hasData }: { hasData: boolean }) {
  const [busy, setBusy] = useState(false);
  const sync = useSync();
  const send = () => {
    setBusy(true);
    void exportBook()
      .then((mode) => {
        if (mode === "cancelled") return;
        toast(mode === "shared" ? "Файл готов: отправьте его себе на другое устройство" : "Файл сохранён в «Загрузки»: перенесите его на другое устройство");
      })
      .catch(() => toast("Не получилось собрать файл"))
      .finally(() => setBusy(false));
  };
  return (
    <section data-tour="transfer" className="glass mt-6 rounded-2xl p-5" aria-label="Перенос книги на другое устройство">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        <Smartphone className="size-3.5" /> Для участников программы
      </h2>
      <p className="mt-1 text-[1.2rem] font-semibold leading-tight text-ink">Книга на ваших устройствах</p>
      <p className="mt-2 text-sm text-muted">Доступ работает на трёх устройствах. Книга и фото хранятся в облаке: откройте приложение на другом устройстве с той же оплатой, и книга подтянется сама.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => void syncNow("auto")} disabled={sync.busy}>
          {sync.busy ? "Синхронизирую…" : "Синхронизировать сейчас"}
        </Button>
        {sync.at ? <span className="text-xs text-muted">Последний раз: {new Date(sync.at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span> : null}
      </div>
      {sync.message ? <p className="mt-2 text-sm text-ink">{sync.message}</p> : null}
      {sync.conflict ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => void syncNow("mine")}>Оставить с этого устройства</Button>
          <Button variant="soft" onClick={() => void syncNow("cloud")}>Взять из облака</Button>
        </div>
      ) : null}
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Или без интернета: перенос файлом</p>
      <ol className="mt-2 grid gap-1.5 text-sm text-muted">
        <li>1. Здесь нажмите «Отправить на другое устройство» и отправьте файл себе: в AirDrop, Telegram, почту или в «Файлы».</li>
        <li>2. На втором устройстве откройте приложение и нажмите «Открыть копию».</li>
        <li>3. Выберите этот файл, и книга загрузится целиком: тексты, фото, древо.</li>
      </ol>
      <p className="mt-2 text-xs text-muted">Это перенос на момент отправки. Когда закончите работу на одном устройстве, перенесите книгу на другое. Изменения, сделанные на двух устройствах одновременно, не объединяются.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={send} disabled={busy || !hasData}>
          {busy ? "Собираю…" : "Отправить на другое устройство"}
        </Button>
        <OpenCopyButton className="min-h-11" />
      </div>
    </section>
  );
}
