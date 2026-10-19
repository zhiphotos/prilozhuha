import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { layoutPages, parseStructure, type Item } from "@/lib/rod/auto-layout";
import { API_BASE } from "@/lib/rod/config";
import { useRod } from "@/lib/rod/store";

const EXAMPLE = `Как мы с бабушкой пекли пироги

Каждое воскресенье бабушка вставала в шесть утра. Я просыпалась от запаха теста и шла на кухню в одних носках. Бабушка говорила: «Руки мой, помощница».

Мы лепили пироги с капустой и с яблоками. Те, что кривые, бабушка называла «мои любимые».

Дом на Еловой

Дом стоял на краю деревни. Зимой его заносило по окна, и дед откапывал крыльцо лопатой, напевая одну и ту же песню.`;

/** Вставьте текст целиком: заголовки, абзацы и цитаты получат своё оформление, длинное разойдётся по страницам. */
export function TextToPagesSheet({ onClose }: { onClose: () => void }) {
  const pages = useRod((state) => state.pages);
  const insertPage = useRod((state) => state.insertPage);
  const [text, setText] = useState("");
  const [aiItems, setAiItems] = useState<Item[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Шрифты нужны для точного подсчёта строк.
    void (document.fonts?.ready ?? Promise.resolve()).then(() => setReady(true));
  }, []);

  const items = useMemo(() => aiItems ?? parseStructure(text), [aiItems, text]);
  const laid = useMemo(() => (ready && items.length ? layoutPages(items) : []), [ready, items]);

  const withAi = async () => {
    setBusy(true);
    try {
      const response = await fetch(`${API_BASE}/api/layout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      const answer = (await response.json()) as { items?: Item[]; error?: string };
      if (!answer.items?.length) throw new Error(answer.error || "ИИ не ответил");
      setAiItems(answer.items);
      toast("ИИ разметил текст. Посмотрите страницы ниже.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "ИИ не ответил. Оставила разметку по правилам.", { duration: 5000 });
    } finally {
      setBusy(false);
    }
  };

  const build = () => {
    let at = pages.length;
    for (const page of laid) {
      insertPage(page, at);
      at += 1;
    }
    toast(`Добавлено ${laid.length} ${laid.length === 1 ? "страница" : laid.length < 5 ? "страницы" : "страниц"}`);
    onClose();
  };

  return (
    <Sheet title="Текст → страницы" onClose={onClose}>
      <p className="text-sm text-muted">Вставьте текст целиком. Заголовки станут крупными, абзацы обычным шрифтом, цитаты рукописным, а длинное разойдётся по страницам. Останется только оформить.</p>
      <textarea className="field mt-3 min-h-40 w-full" value={text} onChange={(event) => { setText(event.target.value); setAiItems(null); }} placeholder="Вставьте текст сюда" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" className="text-sm text-moss underline" onClick={() => { setText(EXAMPLE); setAiItems(null); }}>
          Вставить пример
        </button>
        {API_BASE ? (
          <Button variant="soft" disabled={busy || text.trim().length < 40} onClick={() => void withAi()}>
            {busy ? "ИИ думает…" : "Разметить с помощью ИИ"}
          </Button>
        ) : null}
      </div>
      {laid.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">
            Получится {laid.length} {laid.length === 1 ? "страница" : laid.length < 5 ? "страницы" : "страниц"}
          </p>
          <ol className="mt-2 grid gap-1.5">
            {laid.slice(0, 12).map((page, index) => (
              <li key={index} className="flex gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 tabular-nums text-muted">{index + 1}</span>
                <span className="min-w-0 truncate text-ink">{page.title}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{page.blocks.length} блок.</span>
              </li>
            ))}
          </ol>
          {laid.length > 12 ? <p className="mt-1 text-xs text-muted">и ещё {laid.length - 12}</p> : null}
        </div>
      ) : null}
      <Button className="mt-5 w-full" disabled={!laid.length} onClick={build}>
        {laid.length ? `Создать ${laid.length} стр. в конце книги` : "Вставьте текст"}
      </Button>
    </Sheet>
  );
}
