import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { OpenCopyButton } from "@/components/rod/open-copy";
import { exportBook } from "@/lib/rod/backup";
import { previewMergeNow, restoreBackup, restorePreviousCloudVersion, syncNow, useSync } from "@/lib/rod/sync";
import { listBackups, type BackupInfo } from "@/lib/rod/sync-backup";

/** Для тех, у кого открыта программа: перенести книгу на второй телефон или компьютер. Это перенос копии, а не постоянная синхронизация. */
export function TransferCard({ hasData }: { hasData: boolean }) {
  const [busy, setBusy] = useState(false);
  const sync = useSync();
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  useEffect(() => {
    void listBackups().then(setBackups).catch(() => setBackups([]));
  }, [sync.busy, sync.message]);
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
        <Button variant="soft" onClick={send} disabled={busy || !hasData}>
          {busy ? "Собираю…" : "Отправить файлом (AirDrop)"}
        </Button>
        {sync.at ? <span className="text-xs text-muted">Последний раз: {new Date(sync.at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}</span> : null}
      </div>
      {sync.message ? <p className="mt-2 text-sm text-ink">{sync.message}</p> : null}
      {sync.conflict ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <p className="w-full text-sm text-muted">«Объединить обе» собирает в одну книгу всё, что есть на обоих устройствах. Удаления при этом не переносятся: если вы что-то удалили здесь, а в облаке оно осталось (или наоборот), оно вернётся. Если одна и та же карточка изменена и здесь, и в облаке, останется версия с этого устройства, а облачная сохранится в копии. «Оставить с этого устройства» заменит книгу в облаке книгой с этого устройства. «Взять из облака» заменит книгу на этом устройстве облачной. В обоих случаях другая версия сначала сохраняется на этом устройстве, её можно вернуть ниже.</p>
          <Button variant="soft" onClick={() => void syncNow("mine")}>Оставить с этого устройства</Button>
          <Button variant="soft" onClick={() => void syncNow("cloud")}>Взять из облака</Button>
          <Button
            variant="soft"
            onClick={() => {
              void (async () => {
                const preview = await previewMergeNow();
                if (!preview.ok) {
                  useSync.getState().setState({ message: preview.message });
                  return;
                }
                const { added, differing } = preview.report.total;
                const text = `Объединить книги? Из облака добавится записей: ${added}.${differing ? ` Одних и тех же записей с разным содержимым: ${differing}, останутся версии с этого устройства (облачные сохранятся в копии).` : ""} Удаления не переносятся: удалённое на одном устройстве, но оставшееся на другом, вернётся. Обе прежние версии сохранятся копиями на этом устройстве.`;
                if (window.confirm(text)) void syncNow("merge");
              })();
            }}
          >
            Объединить обе
          </Button>
        </div>
      ) : null}
      <div className="mt-3">
        <Button
          variant="soft"
          disabled={sync.busy}
          onClick={() => {
            if (!window.confirm("Вернуть предыдущую облачную версию? Книга на этом устройстве сначала сохранится как резервная копия, а предыдущая версия станет новой версией в облаке.")) return;
            void restorePreviousCloudVersion();
          }}
        >
          Вернуть предыдущую облачную версию
        </Button>
      </div>
      {backups.length ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Резервные копии на этом устройстве</p>
          <ul className="mt-2 grid gap-2">
            {backups.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white/60 p-3 text-sm">
                <span>
                  {item.label}
                  <span className="block text-xs text-muted">{new Date(item.at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · людей {item.people}, страниц {item.pages}</span>
                </span>
                <Button
                  variant="soft"
                  onClick={() => {
                    if (!window.confirm("Вернуть книгу из этой копии? Текущая книга сначала сохранится как отдельная копия.")) return;
                    void restoreBackup(item.key).then((ok) => toast(ok ? "Книга возвращена из копии" : "Копия не прочиталась"));
                  }}
                >
                  Вернуть
                </Button>
              </li>
            ))}
          </ul>
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
