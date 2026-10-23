import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { layoutPages, parseStructure, type Item } from "@/lib/rod/auto-layout";
import { API_BASE } from "@/lib/rod/config";
import { serverStatus } from "@/lib/rod/server";
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
  const [aiLive, setAiLive] = useState(false);
  /** Промежуток книги, куда ляжет текст: «с страницы» и «по страницу» (по умолчанию в конец, без предела). */
  const [fromText, setFromText] = useState("");
  const [toText, setToText] = useState("");
  useEffect(() => {
    void serverStatus().then((status) => setAiLive(status.ai));
  }, []);

  useEffect(() => {
    // Шрифты нужны для точного подсчёта строк.
    void (document.fonts?.ready ?? Promise.resolve()).then(() => setReady(true));
  }, []);

  const items = useMemo(() => aiItems ?? parseStructure(text), [aiItems, text]);
  const laid = useMemo(() => (ready && items.length ? layoutPages(items) : []), [ready, items]);

  // Номера как в сетке книги: обложка не считается, первая внутренняя страница это «1».
  const offset = pages[0]?.kind === "cover" ? 1 : 0;
  const inner = pages.length - offset;
  const fromPage = Math.min(Math.max(1, Number.parseInt(fromText, 10) || inner + 1), inner + 1);
  const toParsed = Number.parseInt(toText, 10);
  const toPage = Number.isFinite(toParsed) ? toParsed : null;
  const rangeBad = toPage !== null && toPage < fromPage;
  const room = toPage === null || rangeBad ? Infinity : toPage - fromPage + 1;
  const tooLong = laid.length > room;

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
    if (tooLong || rangeBad) return;
    let at = fromPage - 1 + offset;
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
        {aiLive ? (
          <Button variant="soft" disabled={busy || text.trim().length < 40} onClick={() => void withAi()}>
            {busy ? "ИИ думает…" : "Разметить с помощью ИИ"}
          </Button>
        ) : null}
      </div>
      <div className="mt-4 rounded-2xl bg-white/60 p-3">
        <p className="text-sm font-semibold text-ink">В какие страницы вставить</p>
        <p className="mt-0.5 text-xs text-muted">В книге сейчас {inner} {inner === 1 ? "страница" : inner > 1 && inner < 5 ? "страницы" : "страниц"}. Пусто: текст пойдёт в конец, сколько понадобится.</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs text-muted">
            С страницы
            <input className="field" inputMode="numeric" value={fromText} onChange={(event) => setFromText(event.target.value.replace(/\D/g, ""))} placeholder={String(inner + 1)} />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            По страницу
            <input className="field" inputMode="numeric" value={toText} onChange={(event) => setToText(event.target.value.replace(/\D/g, ""))} placeholder="без предела" />
          </label>
        </div>
        {rangeBad ? <p className="mt-2 text-sm text-[#9a3b3b]">«По страницу» должна быть не меньше «с страницы».</p> : null}
        {tooLong && !rangeBad ? <p className="mt-2 text-sm text-[#9a3b3b]">Текст занимает {laid.length} стр., а в промежутке {room}. Расширьте промежуток или сократите текст.</p> : null}
      </div>
      {laid.length ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink">
            Получится {laid.length} {laid.length === 1 ? "страница" : laid.length < 5 ? "страницы" : "страниц"}
          </p>
          <ol className="mt-2 grid gap-1.5">
            {laid.slice(0, 12).map((page, index) => (
              <li key={index} className="flex gap-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
                <span className="w-6 shrink-0 tabular-nums text-muted">{fromPage + index}</span>
                <span className="min-w-0 truncate text-ink">{page.title}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">{page.blocks.length} блок.</span>
              </li>
            ))}
          </ol>
          {laid.length > 12 ? <p className="mt-1 text-xs text-muted">и ещё {laid.length - 12}</p> : null}
        </div>
      ) : null}
      <Button className="mt-5 w-full" disabled={!laid.length || tooLong || rangeBad} onClick={build}>
        {laid.length ? (fromPage > inner ? `Создать ${laid.length} стр. в конце книги` : `Вставить ${laid.length} стр. начиная со страницы ${fromPage}`) : "Вставьте текст"}
      </Button>
    </Sheet>
  );
}
