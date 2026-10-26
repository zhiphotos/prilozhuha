import { useState } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { OpenCopyButton } from "@/components/rod/open-copy";
import { exportBook } from "@/lib/rod/backup";

/** Для тех, у кого открыта программа: перенести книгу на второй телефон или компьютер. Это перенос копии, а не постоянная синхронизация. */
export function TransferCard({ hasData }: { hasData: boolean }) {
  const [busy, setBusy] = useState(false);
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
    <section className="glass mt-6 rounded-2xl p-5" aria-label="Перенос книги на другое устройство">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
        <Smartphone className="size-3.5" /> Для участников программы
      </h2>
      <p className="mt-1 text-[1.2rem] font-semibold leading-tight text-ink">Книга на втором устройстве</p>
      <ol className="mt-2 grid gap-1.5 text-sm text-muted">
        <li>1. Здесь нажмите «Отправить на другое устройство» и отправьте файл себе: в AirDrop, Telegram, почту или в «Файлы».</li>
        <li>2. На втором устройстве откройте приложение и нажмите «Открыть копию».</li>
        <li>3. Выберите этот файл, и книга загрузится целиком: тексты, фото, древо.</li>
      </ol>
      <p className="mt-2 text-xs text-muted">Это перенос на момент отправки, а не постоянная синхронизация. Когда закончите работу на одном устройстве, перенесите книгу на другое. Изменения, сделанные на двух устройствах одновременно, не объединяются.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={send} disabled={busy || !hasData}>
          {busy ? "Собираю…" : "Отправить на другое устройство"}
        </Button>
        <OpenCopyButton className="min-h-11" />
      </div>
    </section>
  );
}
