import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, ExternalLink, X } from "lucide-react";
import { buildCase, type Lead, type Seek } from "@/lib/tree/ancestorSearch";
import { displayName } from "@/lib/tree/kinship";
import { SEARCH_LIMIT } from "@/lib/rod/search-limit";
import type { Person } from "@/lib/tree/types";

const SEEKS: { id: Seek; label: string }[] = [
  { id: "parents", label: "Родители" },
  { id: "war", label: "Война" },
  { id: "repression", label: "Репрессии" },
  { id: "siblings", label: "Братья и сёстры" },
];

export type FoundRole = "father" | "mother" | "brother" | "spouse";
const ROLES: { id: FoundRole; label: string }[] = [
  { id: "father", label: "Это отец" },
  { id: "mother", label: "Это мать" },
  { id: "brother", label: "Это брат или сестра" },
  { id: "spouse", label: "Это супруг" },
];

export type FoundRecord = { role: FoundRole; name: string; years: string; note: string };

export function AncestorSearch({ person, left, onSpend, onPlant, onClose }: { person: Person; left: number; onSpend: () => boolean; onPlant: (found: FoundRecord) => void; onClose: () => void }) {
  const [place, setPlace] = useState("");
  const [seek, setSeek] = useState<Seek>("parents");
  const [role, setRole] = useState<FoundRole>("father");
  const [foundName, setFoundName] = useState("");
  const [foundYears, setFoundYears] = useState("");
  const [source, setSource] = useState("");
  const [quote, setQuote] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState("");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const plan = useMemo(
    () =>
      buildCase({
        firstName: person.firstName,
        patronymic: person.patronymic,
        lastName: person.lastName,
        birthYear: person.birthYear,
        deathYear: person.deathYear,
        place,
        seek,
      }),
    [person, place, seek],
  );

  const shown = leads ?? plan.leads;

  const close = () => {
    onClose();
  };

  const search = () => {
    if (!onSpend()) {
      setError(`В этом месяце все ${SEARCH_LIMIT} поисков уже использованы. Они вернутся в начале следующего месяца.`);
      return;
    }
    const first = plan.leads[0];
    const second = plan.leads[1];
    setError(null);
    setLeads(plan.leads);
    setSummary(
      [
        plan.question,
        first ? `Сначала «${first.title}»: вставьте «${first.query}».` : "",
        second ? `Дальше то же имя в «${second.title}».` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  };

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      setCopied("");
    }
  };

  const plant = () => {
    onPlant({ role, name: foundName.trim(), years: foundYears.trim(), note: `Гипотеза, один источник. ${source.trim() || "источник не назван"}. ${quote.trim()}`.trim() });
  };

  const panel = (
    <div
      data-ui
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 md:items-center md:p-6"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) close();
      }}
    >
      <section className="sheet flex max-h-[94dvh] w-full max-w-xl flex-col rounded-t-3xl md:rounded-3xl" style={{ touchAction: "manipulation" }}>
        <header className="flex items-start gap-3 px-5 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs tracking-widest text-muted uppercase">Подписка · архивы</p>
            <h2 className="font-serif text-4xl leading-none">Искать предков</h2>
            <p className="mt-2 text-sm text-muted">{displayName(person, "full")}</p>
          </div>
          <button
            type="button"
            className="chip !bg-sheet !text-ink"
            aria-label="Закрыть"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              close();
            }}
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="mt-4 flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
          <p className="text-base leading-relaxed">{plan.question}</p>
          <label className="field">
            Место: село, уезд, губерния
            <input value={place} placeholder="село Красное, Тамбовская губерния" onChange={(e) => { setPlace(e.target.value); setLeads(null); setSummary(""); }} />
          </label>
          <div className="flex flex-wrap gap-2">
            {SEEKS.map((item) => (
              <button key={item.id} type="button" className={`min-h-11 rounded-full px-3 text-sm font-semibold ${seek === item.id ? "bg-ink text-sheet" : "border border-line bg-white"}`} onClick={() => { setSeek(item.id); setLeads(null); setSummary(""); }}>
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-ink px-3 text-base font-semibold text-sheet active:scale-[0.98]"
            style={{ touchAction: "manipulation" }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              search();
            }}
          >
            Найти наводки
            <span className="ml-2 rounded-full bg-sheet px-2 py-0.5 text-sm text-ink">осталось {left} из {SEARCH_LIMIT}</span>
          </button>
          <p className="text-sm text-muted">Каждое нажатие «Найти наводки» считается за один поиск. В месяц доступно {SEARCH_LIMIT}.</p>
          {summary && (
          <section className="flex flex-col gap-2">
            <p className="text-xs tracking-widest text-muted uppercase">Наводки</p>
            <p className="text-base leading-relaxed">{summary}</p>
            {shown.map((link, index) => (
              <article key={link.id} className="rounded-3xl border border-line bg-white p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-2xl leading-none">
                    {index + 1}. {link.title}
                  </h3>
                  <span className="text-xs tracking-widest text-muted uppercase">{link.grade === "A" ? "архив" : link.grade === "C" ? "наводка" : "указатель"}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{link.why}</p>
                <p className="mt-2 text-sm">В поиск: {link.query}</p>
                <a className="chip mt-3" href={link.href} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" />
                  Открыть
                </a>
              </article>
            ))}
          </section>
          )}
          <section className="rounded-3xl border border-line bg-white p-4">
            <p className="text-xs tracking-widest text-muted uppercase">Что вставить в поиск</p>
            <p className="mt-2 font-serif text-2xl leading-tight">{plan.query}</p>
            <button type="button" className="chip mt-3" onClick={() => void copy(plan.query, "query")}>
              <Copy className="size-4" />
              {copied === "query" ? "Скопировано" : "Скопировать"}
            </button>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.variants.slice(1).map((variant) => (
                <button key={variant} type="button" className="rounded-full border border-line px-3 py-1 text-left text-sm" onClick={() => void copy(variant, variant)}>
                  {copied === variant ? "Скопировано" : variant}
                </button>
              ))}
            </div>
          </section>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          <section className="rounded-3xl bg-ink p-4 text-sheet">
            <p className="text-sm leading-relaxed">{plan.caution}</p>
            <button type="button" className="chip mt-3 !bg-sheet !text-ink" onClick={() => void copy(plan.letter, "letter")}>
              <Copy className="size-4" />
              {copied === "letter" ? "Письмо скопировано" : "Письмо в архив"}
            </button>
          </section>
          <section className="flex flex-col gap-3 rounded-3xl border border-line bg-white p-4">
            <p className="text-xs tracking-widest text-muted uppercase">Если нашли запись</p>
            <div className="flex flex-wrap gap-2">
              {ROLES.map((item) => (
                <button key={item.id} type="button" className={`min-h-11 rounded-full px-3 text-sm font-semibold ${role === item.id ? "bg-ink text-sheet" : "border border-line"}`} onClick={() => setRole(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
            <label className="field">
              Фамилия имя отчество
              <input value={foundName} placeholder="Волков Пётр Сидорович" onChange={(e) => setFoundName(e.target.value)} />
            </label>
            <label className="field">
              Годы
              <input value={foundYears} placeholder="1888" onChange={(e) => setFoundYears(e.target.value)} />
            </label>
            <label className="field">
              Откуда запись
              <input value={source} placeholder="Память народа, донесение о потерях" onChange={(e) => setSource(e.target.value)} />
            </label>
            <label className="field">
              Что написано
              <textarea value={quote} placeholder="Призван из села Красного в 1941" onChange={(e) => setQuote(e.target.value)} />
            </label>
            {error && <p className="text-sm text-rose-700">{error}</p>}
            <button type="button" className="min-h-12 rounded-2xl bg-ink px-3 text-sm font-semibold text-sheet" disabled={!foundName.trim()} onClick={plant}>
              Положить в древо как гипотезу
            </button>
          </section>
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(<div className="tree-root" data-theme="paper">{panel}</div>, document.body);
}
