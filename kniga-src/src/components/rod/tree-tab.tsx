import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, Moon, Plus, Settings, Sun, Users } from "lucide-react";
import { PaySheet } from "@/components/rod/lessons";
import { useNav } from "@/components/rod/chrome";
import { useRod } from "@/lib/rod/store";
import { AddPerson } from "@/components/tree/AddPerson";
import { PersonDrawer } from "@/components/tree/PersonDrawer";
import { TreeStage } from "@/components/tree/TreeStage";
import { StylePreview } from "@/components/tree/StylePreview";
import { GedImportButton } from "@/components/rod/ged-import";
import { Hint } from "@/components/rod/hint";
import { TreeSearch } from "@/components/tree/TreeSearch";
import { searchPeople } from "@/lib/tree/search";
import { displayName, kinship, yearsOf } from "@/lib/tree/kinship";
import { layoutTree, sliceByRadius } from "@/lib/tree/layout";
import { SCOPES, scopeFilter } from "@/lib/tree/scope";
import { layoutCameo } from "@/lib/tree/cameo";
import { layoutGzhel } from "@/lib/tree/gzhel";
import { layoutBoheme } from "@/lib/tree/boheme";
import { layoutTaiga } from "@/lib/tree/taiga";
import { layoutPoster } from "@/lib/tree/poster";
import { exportPoster } from "@/lib/tree/exportPoster";
import { useTree, warmPhotos, type TreeStyle } from "@/lib/tree/ui-store";

export function TreeTab() {
  return createPortal(<TreeScreen />, document.body);
}

function TreeScreen() {
  const nav = useNav();
  const programOpen = useRod((state) => state.programOpen);
  const rodPeople = useRod((state) => state.people);
  const [pay, setPay] = useState(false);
  const [preview, setPreview] = useState<TreeStyle | null>(null);
  useEffect(() => warmPhotos(), [rodPeople]);
  const people = useTree((s) => s.people);
  const unions = useTree((s) => s.unions);
  const focusId = useTree((s) => s.focusId);
  const theme = useTree((s) => s.theme);
  // Точки на фоне можно выключить: у части людей от них укачивает.
  const [dots, setDots] = useState(() => {
    try {
      return localStorage.getItem("kniga-tree-dots") !== "off";
    } catch {
      return true;
    }
  });
  // Цвет линий древо: свой выбор, хранится на устройстве; пусто – цвет темы.
  const [lineColor, setLineColor] = useState<string>(() => {
    try {
      return localStorage.getItem("kniga-tree-line") ?? "";
    } catch {
      return "";
    }
  });
  const pickLine = (value: string) => {
    setLineColor(value);
    try {
      if (value) localStorage.setItem("kniga-tree-line", value);
      else localStorage.removeItem("kniga-tree-line");
    } catch {
      /* без запоминания */
    }
  };
  const toggleDots = () => {
    setDots((v) => {
      try {
        localStorage.setItem("kniga-tree-dots", v ? "off" : "on");
      } catch {
        /* без запоминания */
      }
      return !v;
    });
  };
  const style = useTree((s) => s.style);
  const selectedId = useTree((s) => s.selectedId);
  const unionOpen = useTree((s) => s.unionId);
  const roster = useTree((s) => s.roster);
  const selectPerson = useTree((s) => s.selectPerson);
  const selectUnion = useTree((s) => s.selectUnion);
  const setRoster = useTree((s) => s.setRoster);
  const setTheme = useTree((s) => s.setTheme);
  const setStyle = useTree((s) => s.setStyle);
  const flow = useTree((s) => s.flow);
  const setFlow = useTree((s) => s.setFlow);
  const [centerReq, setCenterReq] = useState<{ id: string; n: number } | null>(null);
  const [radius, setRadius] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState(false);
  const [sheetPick, setSheetPick] = useState(false);
  const [fitReq, setFitReq] = useState(0);
  // При входе в древо камера встаёт на «Вас»: большое древо иначе открывается на дальних предках.
  useEffect(() => {
    // Дважды: раскладка большого древа и фото подгружаются не сразу, и первая наводка может промахнуться.
    const ids = [80, 700].map((ms) => window.setTimeout(() => setCenterReq({ id: useTree.getState().focusId, n: Date.now() }), ms));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, []);
  const scope = useTree((s) => s.scope);
  const setScope = useTree((s) => s.setScope);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeShift, setScopeShift] = useState(0);
  const scopeBox = useRef<HTMLDivElement>(null);
  const shown = useMemo(() => scopeFilter(people, unions, focusId, scope), [people, unions, focusId, scope]);
  const view = useMemo(() => sliceByRadius(shown.people, shown.unions, focusId, radius), [shown, focusId, radius]);
  const spread = useTree((s) => s.spread);
  const setSpread = useTree((s) => s.setSpread);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const layout = useMemo(() => layoutTree(view.people, view.unions, focusId, flow), [view, focusId, flow, spread]);
  const poster = useMemo(() => (style === "carved" ? layoutPoster(view.people, view.unions, focusId, flow) : null), [style, view, focusId, flow]);
  const cameo = useMemo(() => (style === "cameo" ? layoutCameo(view.people, view.unions, focusId, flow) : null), [style, view, focusId, flow]);
  const gzhel = useMemo(() => (style === "gzhel" ? layoutGzhel(view.people, view.unions, focusId, flow) : null), [style, view, focusId, flow]);
  const boheme = useMemo(() => (style === "boheme" ? layoutBoheme(view.people, view.unions, focusId, flow) : null), [style, view, focusId, flow]);
  const taiga = useMemo(() => (style === "taiga" ? layoutTaiga(view.people, view.unions, focusId, flow) : null), [style, view, focusId, flow]);
  const banner = useTree((s) => s.banner);
  const focus = people.find((p) => p.id === focusId);

  useEffect(() => {
    if (!note) return;
    const timer = window.setTimeout(() => setNote(null), 2800);
    return () => window.clearTimeout(timer);
  }, [note]);

  const save = async (paper: "white" | "black" = "white", format: "png" | "pdf" = "png") => {
    setSheetPick(false);
    setBusy(true);
    setNote(null);
    try {
      await exportPoster({ people: shown.people, unions: shown.unions, focusId }, style, banner, paper, flow, format);
      const saved =
        style === "work"
          ? paper === "black"
            ? "Лист сохранён: схема на чёрном"
            : "Лист сохранён: схема на белом"
          : style === "taiga"
            ? "Лист сохранён в стиле «Тайга»"
            : style === "boheme"
              ? "Лист сохранён в стиле «Богема»"
              : style === "gzhel"
                ? "Лист сохранён в стиле «Гжель»"
                : style === "cameo"
                  ? "Лист сохранён в стиле «Камея»"
                  : style === "carved"
                    ? "Лист сохранён: живое древо и подпись «Книга Рода» внизу"
                    : "Лист сохранён: светлая бумага и подпись «Книга Рода» внизу";
      setNote(saved.replace("Лист", format === "pdf" ? "PDF" : "PNG"));
    } catch {
      setNote(format === "pdf" ? "Не удалось собрать PDF" : "Не удалось собрать картинку");
    } finally {
      setBusy(false);
    }
  };

  const openAdd = () => {
    setRoster(false);
    selectPerson(null);
    selectUnion(null);
    setAdd(true);
  };

  return (
    <main data-theme={theme} className={`tree-root${dots ? "" : " no-dots"} fixed inset-0 z-40 overflow-hidden bg-canvas text-fg`} style={lineColor ? ({ "--color-blood": lineColor } as React.CSSProperties) : undefined}>
      <TreeStage
        layout={layout}
        people={people}
        unions={unions}
        focusId={focusId}
        selectedId={selectedId}
        centerReq={centerReq}
        radius={radius}
        fitReq={fitReq}
        onRadius={(next) => {
          setRadius(next);
          setCenterReq({ id: focusId, n: Date.now() });
        }}
        onSelectPerson={(id) => selectPerson(id)}
        onSelectUnion={(id) => selectUnion(id)}
        onLocate={() => {
          selectPerson(null);
          selectUnion(null);
          setCenterReq({ id: focusId, n: Date.now() });
        }}
        onJump={(id) => {
          selectPerson(null);
          selectUnion(null);
          setCenterReq({ id, n: Date.now() });
        }}
        onClear={() => {
          selectPerson(null);
          selectUnion(null);
        }}
        style={style}
        poster={poster}
        cameo={cameo}
        gzhel={gzhel}
        boheme={boheme}
        taiga={taiga}
        flow={flow}
        onFlow={(next) => {
          setFlow(next);
          setFitReq((n) => n + 1);
        }}
        stylesLocked={!programOpen}
        onStyle={(next: TreeStyle) => {
          if (next !== "work" && !programOpen) {
            setPreview(next);
            return;
          }
          setStyle(next);
          setFitReq((n) => n + 1);
        }}
      />
      <header className={`pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] ${roster ? "dock-left" : ""} ${selectedId || unionOpen ? "dock-right" : ""}`}>
        <button type="button" className="chip pointer-events-auto" aria-label="Назад в архив" onClick={() => nav.replace({ id: "archive", tab: "people" })}>
          <ChevronLeft className="size-5" />
        </button>
        <div className="pointer-events-auto min-w-0 flex-1">
          <p className="truncate font-serif text-2xl leading-none sm:text-3xl">Книга Рода</p>
          <p className="mt-1 truncate text-sm text-fg-soft">{focus ? displayName(focus) : "Пустое древо"}</p>
        </div>
        <div className="pointer-events-auto flex w-full flex-wrap gap-2">
          <button type="button" className="chip !bg-gold !text-ink" onClick={openAdd}>
            <Plus className="size-5" />
            Добавить
          </button>
          <TreeSearch
            onJump={(id) => {
              setRoster(false);
              selectPerson(id);
              setCenterReq({ id, n: Date.now() });
            }}
          />
          {people.length <= 2 && <Hint id="tree-ged"><GedImportButton /></Hint>}
          <button type="button" className="chip" aria-label="Настройки древа" aria-expanded={toolsOpen} onClick={() => setToolsOpen((v) => !v)}>
            <Settings className="size-5" />
          </button>
          {toolsOpen && (
            <>
            <button type="button" className="chip" aria-label="Список рода" onClick={() => setRoster(!roster)}>
              <Users className="size-5" />
            </button>
            {people.length > 2 && <Hint id="tree-ged"><GedImportButton /></Hint>}
            <div className="relative" ref={scopeBox}>
              <button
                type="button"
                className="chip"
                aria-expanded={scopeOpen}
                onClick={() => {
                  // Меню шире экрана телефона: сдвигаем его влево, чтобы оно целиком помещалось.
                  const left = scopeBox.current?.getBoundingClientRect().left ?? 12;
                  setScopeShift(Math.max(0, left - 12));
                  setScopeOpen((v) => !v);
                }}
              >
                Расширенные{scope === "all" && spread === 0 ? "" : " •"} ▾
              </button>
              {scopeOpen && (
                <div style={{ left: -scopeShift }} className="absolute top-12 z-30 grid w-[min(20rem,calc(100vw-1.5rem))] gap-1 rounded-2xl border border-chip-line bg-chip p-1 shadow-lg backdrop-blur-md">
                  {SCOPES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={scope === item.id}
                      className={`rounded-xl px-3 py-2 text-left ${scope === item.id ? "bg-gold text-ink" : "text-chip-fg"}`}
                      onClick={() => {
                        setScope(item.id);
                        setScopeOpen(false);
                        setFitReq((n) => n + 1);
                      }}
                    >
                      <span className="block text-sm font-semibold">{item.label}</span>
                      <span className="block text-xs opacity-75">{item.hint}</span>
                    </button>
                  ))}
                  <div className="mt-1 border-t border-chip-line px-3 pt-2 pb-1">
                    <p className="text-sm font-semibold text-chip-fg">Расстояние между ветками</p>
                    <div className="mt-1 flex gap-1">
                      {([[0, "Плотно"], [1, "Шире"], [2, "Ещё шире"]] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={spread === value}
                          className={`min-h-9 flex-1 rounded-xl px-2 text-xs font-semibold ${spread === value ? "bg-gold text-ink" : "text-chip-fg"}`}
                          onClick={() => {
                            setSpread(value);
                            setFitReq((n) => n + 1);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <label className="chip pointer-events-auto relative cursor-pointer" aria-label="Цвет линий">
              <span className="size-4 rounded-full border border-chip-line" style={{ background: lineColor || "var(--color-blood)" }} /> Линии
              <input type="color" className="absolute inset-0 size-full cursor-pointer opacity-0" value={/^#[0-9a-f]{6}$/i.test(lineColor) ? lineColor : "#8eb6ff"} onChange={(event) => pickLine(event.target.value)} />
            </label>
            {lineColor ? (
              <button type="button" className="chip" aria-label="Вернуть цвет линий по умолчанию" onClick={() => pickLine("")}>
                Сбросить
              </button>
            ) : null}
            <button type="button" className="chip" aria-label={dots ? "Убрать точки на фоне" : "Вернуть точки на фоне"} aria-pressed={!dots} onClick={toggleDots}>
              {dots ? "Точки ✓" : "Точки"}
            </button>
            <button type="button" className="chip" aria-label="Тема" onClick={() => setTheme(theme === "night" ? "paper" : "night")}>
              {theme === "night" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <div className="relative">
              <button type="button" className="chip" disabled={busy || people.length === 0} aria-expanded={sheetPick} onClick={() => setSheetPick((open) => !open)}>
                {busy ? "…" : "Сохранить как"}
              </button>
              {sheetPick && (
                <div className="absolute top-12 right-0 z-30 grid w-48 max-w-[calc(100vw-1.5rem)] gap-1 rounded-2xl border border-chip-line bg-chip p-1 shadow-lg">
                  {style === "work" ? (
                    <>
                      <button type="button" className="min-h-11 rounded-xl bg-white px-3 text-sm font-semibold text-ink" onClick={() => void save("white", "png")}>
                        PNG, белый фон
                      </button>
                      <button type="button" className="min-h-11 rounded-xl bg-ink px-3 text-sm font-semibold text-sheet" onClick={() => void save("black", "png")}>
                        PNG, чёрный фон
                      </button>
                      <button type="button" className="min-h-11 rounded-xl bg-white px-3 text-sm font-semibold text-ink" onClick={() => void save("white", "pdf")}>
                        PDF, белый фон
                      </button>
                      <button type="button" className="min-h-11 rounded-xl bg-ink px-3 text-sm font-semibold text-sheet" onClick={() => void save("black", "pdf")}>
                        PDF, чёрный фон
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="min-h-11 rounded-xl bg-white px-3 text-sm font-semibold text-ink" onClick={() => void save("white", "png")}>
                        PNG, картинка
                      </button>
                      <button type="button" className="min-h-11 rounded-xl bg-white px-3 text-sm font-semibold text-ink" onClick={() => void save("white", "pdf")}>
                        PDF, файл
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </header>
      {note && <p className="absolute top-24 right-3 left-3 z-20 mx-auto max-w-md rounded-2xl bg-chip px-4 py-3 text-center text-sm text-chip-fg">{note}</p>}
      {roster && (
        <Roster
          onJump={(id) => {
            setRoster(false);
            selectPerson(id);
            setCenterReq({ id, n: Date.now() });
          }}
          onClose={() => setRoster(false)}
        />
      )}
      <PersonDrawer onNewBook={() => undefined} />
      {add && focusId && (
        <AddPerson
          initialId={selectedId || focusId}
          onClose={() => setAdd(false)}
          onAdded={(id, name) => {
            setAdd(false);
            setCenterReq({ id, n: Date.now() });
            setNote(`${name} теперь в древе`);
          }}
        />
      )}
      {preview ? (
        <StylePreview
          style={preview}
          onPick={(next) => setPreview(next === "work" ? null : next)}
          onOpen={() => {
            setPreview(null);
            setPay(true);
          }}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {pay ? <PaySheet onClose={() => setPay(false)} /> : null}
    </main>
  );
}

function Roster({
  onJump,
  onClose,
}: {
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const people = useTree((s) => s.people);
  const unions = useTree((s) => s.unions);
  const focusId = useTree((s) => s.focusId);
  const layout = useMemo(() => layoutTree(people, unions, focusId), [people, unions, focusId]);
  const [query, setQuery] = useState("");
  const byId = new Map(people.map((p) => [p.id, p]));
  const matched = useMemo(() => new Set(searchPeople(people, query, people.length).map((p) => p.id)), [people, query]);
  const q = query.trim();
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center md:p-4 lg:inset-y-0 lg:right-auto lg:left-0 lg:w-[380px] lg:justify-start">
      <section className="sheet flex max-h-[74dvh] w-full flex-col rounded-t-3xl md:max-w-xl md:rounded-3xl lg:max-h-none lg:h-full lg:max-w-none">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="font-serif text-3xl">Весь род</h2>
          <button type="button" className="chip !bg-sheet !text-ink" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <label className="field mx-5 mt-3">
          Найти
          <input value={query} placeholder="Имя или фамилия" onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          {layout.labels.map((label) => {
            const row = layout.nodes
              .filter((n) => n.gen === label.gen)
              .sort((a, b) => a.x - b.x)
              .map((n) => byId.get(n.id))
              .filter((p): p is NonNullable<typeof p> => Boolean(p))
              .filter((p) => !q || matched.has(p.id));
            if (!row.length) return null;
            return (
              <div key={label.gen} className="mb-3">
                <p className="px-2 text-xs tracking-widest text-muted uppercase">{label.text}</p>
                {row.map((person) => {
                  const kin = kinship(people, unions, focusId, person.id);
                  return (
                    <button key={person.id} type="button" className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-white" onClick={() => onJump(person.id)}>
                      <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#d7c3a4] font-serif">
                        {person.photo ? <img src={person.photo} alt="" className="size-full object-cover" /> : person.firstName[0]}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-serif text-xl leading-tight">{displayName(person)}</span>
                        <span className="block truncate text-sm text-muted">
                          {kin.card} · {yearsOf(person)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
