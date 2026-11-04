import { useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { exportBook } from "@/lib/rod/backup";

/** Адрес, куда переехала Книга рода. Задаётся только в сборке для старого адреса (VITE_MOVED_TO), на новом адресе баннера нет. */
const MOVED_TO = (import.meta.env.VITE_MOVED_TO as string | undefined) ?? "";

/** Баннер «Книга рода переехала»: сначала сохранить книгу файлом, потом открыть новый адрес и нажать «Открыть копию». Старый адрес пока работает. */
export function MovedBanner() {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  if (!MOVED_TO) return null;
  const save = () => {
    setBusy(true);
    void exportBook()
      .then((mode) => {
        if (mode === "cancelled") return;
        setSaved(true);
        toast(mode === "shared" ? "Файл готов: сохраните его, он понадобится на новом адресе" : "Файл сохранён в «Загрузки»: он понадобится на новом адресе");
      })
      .catch(() => toast("Не получилось собрать файл"))
      .finally(() => setBusy(false));
  };
  const host = MOVED_TO.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return (
    <section className="aurora mb-5 rounded-2xl p-5" aria-label="Книга рода переехала на новый адрес">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold-ink">Важно</p>
      <h2 className="mt-1 text-[1.25rem] font-semibold leading-tight text-ink">Книга рода переезжает на новый адрес</h2>
      <p className="mt-2 text-sm text-ink/75">
        Новый адрес: <b>{host}</b>. Этот адрес пока работает, но данные из него сами не переносятся. Сначала сохраните книгу файлом, потом откройте новый адрес и нажмите «Открыть копию».
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={busy}>
          <Download className="size-4" /> {busy ? "Собираю файл…" : saved ? "Сохранить файл ещё раз" : "1. Сохранить книгу файлом"}
        </Button>
        <a href={MOVED_TO} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-moss/50 px-4 text-sm font-semibold text-moss" rel="noopener">
          2. Открыть новый адрес <ArrowRight className="size-4" />
        </a>
      </div>
    </section>
  );
}
