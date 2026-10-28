import { Hint } from "@/components/rod/hint";
import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  BringToFront,
  SendToBack,
  BookOpen,
  Copy,
  Crop,
  Droplet,
  Eraser,
  Highlighter,
  Lock,
  Maximize,
  Mic,
  PenLine,
  Pipette,
  Replace,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Type,
  Unlock,
  GripHorizontal,
  PaintBucket,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { BarBtn, Stepper } from "@/components/rod/editor-ui";
import { ColorSheet } from "@/components/rod/color-sheet";
import { Button, Sheet } from "@/components/rod/chrome";
import { BRUSHES, px2w, w2px } from "@/lib/rod/ink";
import { startDictation, type Dictation } from "@/lib/rod/dictate";
import { FONT_FAMILY, fontFamily, lookColors, textMetrics } from "@/lib/rod/page-style";
import { FontLibrarySheet } from "@/components/rod/font-library";
import { libFont } from "@/lib/rod/fonts";
import { SHAPES, isStrokedShape, shapeStyle } from "@/lib/rod/shapes";
import { FONT_LABEL } from "@/lib/rod/pages";
import { useRod } from "@/lib/rod/store";
import { flowToNextPages } from "@/lib/rod/text-flow";
import type { BlendKind, BrushKind, FontKind, FontRef, PageBlock, PhotoFrame, ShapeKind, TextLook } from "@/lib/rod/types";

export type Tool = "hand" | "draw" | "erase" | "fill";

export type BlockOps = {
  patch: (partial: Partial<PageBlock>, group?: string) => void;
  remove: () => void;
  duplicate: () => void;
  layer: (where: "up" | "down" | "top" | "bottom") => void;
  toggleLock: () => void;
  edit: () => void;
  cut: (mode: "auto" | "precise") => void;
  cropMode: () => void;
  cropping: boolean;
  replace: () => void;
  fill: () => void;
  write: () => void;
  full: () => void;
  toggleSpread: () => void;
  canSpread: boolean;
  pickPipette: (done: (color: string) => void) => void;
  centerH: () => void;
  centerV: () => void;
  resetMask: () => void;
  inkColor: (color: string) => void;
  inkScale: (factor: number) => void;
  openFonts: () => void;
  /** Стереть часть выбранного элемента ластиком. */
  erase: () => void;
};

type TextBlock = Extract<PageBlock, { type: "text" }>;

// ——— Выбор шрифта ———

export function FontChips({ value, onPick, onMore, sample }: { value: FontRef; onPick: (font: FontRef) => void; onMore?: () => void; sample?: string }) {
  const custom = useRod((state) => state.fonts);
  const [library, setLibrary] = useState(false);
  const chosen = typeof value === "string" && value.startsWith("custom:") ? libFont(value.slice(7)) : undefined;
  const builtin: FontKind[] = ["sans", "script"];
  return (
    <>
      {builtin.map((font) => (
        <BarBtn key={font} active={value === font || (font === "sans" && value === "serif")} onClick={() => onPick(font)}>
          <span style={{ fontFamily: FONT_FAMILY[font] }}>{FONT_LABEL[font]}</span>
        </BarBtn>
      ))}
      {custom.map((font) => (
        <BarBtn key={font.id} active={value === `custom:${font.id}`} onClick={() => onPick(`custom:${font.id}`)}>
          <span style={{ fontFamily: fontFamily(`custom:${font.id}`) }}>{font.name}</span>
        </BarBtn>
      ))}
      {chosen ? (
        <BarBtn active onClick={() => setLibrary(true)}>
          <span style={{ fontFamily: fontFamily(value) }}>{chosen.name}</span>
        </BarBtn>
      ) : null}
      <BarBtn onClick={() => setLibrary(true)} label="Все шрифты">
        Все шрифты
      </BarBtn>
      {library ? <FontLibrarySheet value={value} sample={sample} onPick={onPick} onClose={() => setLibrary(false)} /> : null}
      {onMore ? (
        <BarBtn onClick={onMore} label="Свой шрифт">
          + Свой шрифт
        </BarBtn>
      ) : null}
    </>
  );
}

// ——— Панель ввода текста: двигается, ниже по умолчанию, пишет по всему экрану ———

const PANEL_KEY = "kniga-textpanel-pos";

function savedPos(): { dx: number; dy: number } {
  try {
    const raw = JSON.parse(localStorage.getItem(PANEL_KEY) ?? "null") as { dx: number; dy: number } | null;
    if (raw && Number.isFinite(raw.dx) && Number.isFinite(raw.dy)) return raw;
  } catch {
    /* по умолчанию */
  }
  return { dx: 0, dy: 0 };
}

function useKeyboardHeight(): number {
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKb(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return kb;
}

export function TextPanel({ block, ops, onChange, onDone }: { block: TextBlock; ops: BlockOps; onChange: (text: string) => void; onDone: () => void }) {
  const [value, setValue] = useState(block.text);
  const latest = useRef(block.text);
  const [colors, setColors] = useState<null | "fg" | "bg">(null);
  const [pos, setPos] = useState(savedPos);
  // Режим «пером где угодно» закрывает весь экран невидимым полем, поэтому его не запоминаем:
  // при каждом открытии текста он выключен, чтобы письмо стилусом не попадало в приложение целиком.
  const [whole, setWhole] = useState(false);
  const [mic, setMic] = useState<string | null>(null);
  const [more, setMore] = useState(() => window.innerWidth >= 430);
  const dictation = useRef<Dictation | null>(null);
  const drag = useRef<{ x: number; y: number; dx: number; dy: number; id: number } | null>(null);
  const kb = useKeyboardHeight();
  // При повороте экрана окно возвращается в видимую область.
  const [, setSizeTick] = useState(0);
  useEffect(() => {
    const on = () => setSizeTick((v) => v + 1);
    window.addEventListener("resize", on);
    window.addEventListener("orientationchange", on);
    return () => {
      window.removeEventListener("resize", on);
      window.removeEventListener("orientationchange", on);
    };
  }, []);
  const shownPos = {
    dx: Math.max(-window.innerWidth / 2 + 60, Math.min(window.innerWidth / 2 - 60, pos.dx)),
    dy: Math.max(-window.innerHeight * 0.15, Math.min(window.innerHeight * 0.55, pos.dy)),
  };
  const px = block.px ?? Math.round(textMetrics(block.font, block.size).size * 10);

  const setBoth = (text: string) => {
    latest.current = text;
    setValue(text);
    onChange(text);
  };

  const dictate = () => {
    if (dictation.current) {
      dictation.current.stop();
      return;
    }
    dictation.current = startDictation({
      onStatus: setMic,
      onText: (said) => setBoth(`${latest.current}${latest.current && !/\s$/.test(latest.current) ? " " : ""}${said}`),
      onError: (message) => toast(message, { duration: 8000 }),
      onEnd: () => {
        dictation.current = null;
        setMic(null);
      },
    });
    if (!dictation.current) setMic(null);
  };

  useEffect(() => () => dictation.current?.stop(), []);

  const boxed = block.look === "card" || block.look === "pill";
  return (
    <>
      {whole ? (
        // Прозрачная область на весь экран: писать стилусом (Scribble) можно в любом месте, текст попадёт на страницу.
        <textarea
          id={`edit-${block.id}`}
          aria-label="Писать по всему экрану"
          value={value}
          onChange={(event) => setBoth(event.target.value)}
          className="fixed inset-0 z-[44] h-full w-full resize-none border-0 bg-transparent p-0 text-transparent caret-transparent outline-none"
          style={{ fontSize: 16 }}
        />
      ) : null}
      <div
        className="glass-strong sheet-in fixed inset-x-3 z-50 mx-auto max-w-xl rounded-2xl p-3"
        style={{ bottom: `calc(${kb}px + 6.4rem - ${shownPos.dy}px)`, transform: `translateX(${shownPos.dx}px)`, maxHeight: "70svh", overflowY: "auto" }}
      >
        <div
          className="-mt-1 mb-1 flex h-9 cursor-grab touch-none items-center justify-center text-ink/60 active:cursor-grabbing"
          onPointerDown={(event) => {
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            drag.current = { x: event.clientX, y: event.clientY, dx: pos.dx, dy: pos.dy, id: event.pointerId };
          }}
          onPointerMove={(event) => {
            const d = drag.current;
            if (!d || d.id !== event.pointerId) return;
            setPos({ dx: d.dx + event.clientX - d.x, dy: d.dy - (event.clientY - d.y) });
          }}
          onPointerUp={() => {
            drag.current = null;
            try {
              localStorage.setItem(PANEL_KEY, JSON.stringify(pos));
            } catch {
              /* без запоминания */
            }
          }}
          aria-label="Потяните, чтобы переместить окно"
        >
          <GripHorizontal className="size-5" />
        </div>
        <textarea
          id={whole ? undefined : `edit-${block.id}`}
          value={value}
          rows={2}
          placeholder={block.placeholder || "Пишите здесь, текст сразу появится на странице"}
          onChange={(event) => setBoth(event.target.value)}
          className="block w-full resize-none rounded-2xl bg-white/80 p-3 text-[17px] leading-snug text-ink outline-none"
          style={{ fontFamily: fontFamily(block.font) }}
        />
        {mic ? <p className="mt-1 px-1 text-xs text-rose-deep">{mic}</p> : null}
        {more ? (
        <>
        <div className="no-scrollbar mt-2 flex items-center gap-1.5 overflow-x-auto">
          <FontChips value={block.font} onPick={(font) => ops.patch({ font } as Partial<PageBlock>)} onMore={ops.openFonts} sample={block.text} />
        </div>
        <div className="mt-2">
          <Stepper
            label="Размер"
            value={px}
            min={10}
            max={300}
            onChange={(v) => ops.patch({ px: v } as Partial<PageBlock>, `size:${block.id}`)}
          />
          <div className="mt-1.5">
            <Stepper label="Пробелы" unit="%" value={Math.round((block.wordGap ?? 0) * 100)} min={-20} max={250} step={5} onChange={(v) => ops.patch({ wordGap: v === 0 ? undefined : v / 100 } as Partial<PageBlock>, `gap:${block.id}`)} />
          </div>
        </div>
        </>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
        <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <BarBtn active={more} onClick={() => setMore(!more)} label="Шрифт и размер">
            Aa
          </BarBtn>
          {more ? (<>{(["left", "center", "right"] as const).map((align) => (
            <BarBtn key={align} wide={false} label={align === "left" ? "По левому краю" : align === "center" ? "По центру" : "По правому краю"} active={(block.align ?? "left") === align} onClick={() => ops.patch({ align } as Partial<PageBlock>)}>
              {align === "left" ? <AlignLeft className="size-4" /> : align === "center" ? <AlignCenter className="size-4" /> : <AlignRight className="size-4" />}
            </BarBtn>
          ))}
          {block.look !== "card" && block.look !== "pill" ? (
            <BarBtn label="Текст обтекает фото и стикеры" active={Boolean(block.wrap)} onClick={() => ops.patch({ wrap: !block.wrap } as Partial<PageBlock>)}>
              Обтекание
            </BarBtn>
          ) : null}
          <BarBtn onClick={ops.centerH} label="По центру страницы">
            ↔ По ширине
          </BarBtn>
          <BarBtn onClick={ops.centerV} label="По центру страницы по высоте">
            ↕ По высоте
          </BarBtn></>) : null}
          <BarBtn onClick={() => setColors("fg")}>
            <span className="size-4 rounded-full border border-ink/20" style={{ background: lookColors(block.look, block.color, block.bg).fg }} /> Цвет
          </BarBtn>
          {boxed ? (
            <BarBtn onClick={() => setColors("bg")}>
              <span className="size-4 rounded-full border border-ink/20" style={{ background: lookColors(block.look, block.color, block.bg).bg }} /> Фон
            </BarBtn>
          ) : null}
          <BarBtn onClick={dictate} active={Boolean(mic)} label="Диктовать голосом">
            <Mic className="size-4" /> {mic ? "Стоп" : "Голос"}
          </BarBtn>
          <BarBtn
            onClick={() => {
              setWhole(!whole);
            }}
            active={whole}
            label="Писать стилусом в любом месте экрана (мешает нажимать на страницу)"
          >
            <PenLine className="size-4" /> Пером где угодно
          </BarBtn>
        </div>
          <Button className="min-h-11 shrink-0 px-4" onClick={onDone}>
            Готово
          </Button>
        </div>
      </div>
      {colors ? (
        <ColorSheet
          title={colors === "fg" ? "Цвет букв" : "Цвет фона"}
          value={colors === "fg" ? block.color : block.bg}
          onPick={(c) => ops.patch((colors === "fg" ? { color: c } : { bg: c }) as Partial<PageBlock>, `color:${block.id}`)}
          onClose={() => setColors(null)}
          onPipette={() => {
            const which = colors;
            setColors(null);
            ops.pickPipette((c) => ops.patch((which === "fg" ? { color: c } : { bg: c }) as Partial<PageBlock>));
          }}
          onReset={() => ops.patch((colors === "fg" ? { color: undefined } : { bg: undefined }) as Partial<PageBlock>)}
        />
      ) : null}
    </>
  );
}

// ——— Рисование ———

export function PenBar({
  tool,
  setTool,
  brush,
  setBrush,
  color,
  onColor,
  sizePx,
  setSizePx,
  eraserPx,
  setEraserPx,
  straight,
  setStraight,
  onPipette,
  onDone,
  eraseHint,
  onAddShape,
}: {
  /** Готовая фигура из списка: ставится на страницу блоком, её можно залить, оставить контуром и растянуть. */
  onAddShape: (kind: ShapeKind) => void;
  eraseHint: string;
  tool: Tool;
  setTool: (tool: Tool) => void;
  brush: BrushKind;
  setBrush: (brush: BrushKind) => void;
  color: string;
  onColor: () => void;
  sizePx: number;
  setSizePx: (px: number) => void;
  eraserPx: number;
  setEraserPx: (px: number) => void;
  straight: boolean;
  setStraight: (v: boolean) => void;
  onPipette: () => void;
  onDone: () => void;
}) {
  const erasing = tool === "erase";
  const [menu, setMenu] = useState<null | "brush" | "shapes">(null);
  const current = BRUSHES.find((item) => item.id === brush) ?? BRUSHES[0];
  const hint = tool === "fill" ? "Нажмите внутрь замкнутого контура: он закрасится выбранным цветом" : erasing ? eraseHint : "";
  const anyShape = straight;
  const pick = (action: () => void) => {
    action();
    setMenu(null);
  };
  return (
    <div className="glass-strong relative mx-auto max-w-xl rounded-2xl p-2">
      {/* Всплывающие списки не меняют высоту панели: страница не прыгает. */}
      {menu === "brush" ? (
        <div className="absolute inset-x-0 bottom-full mb-2 grid max-h-[46dvh] grid-cols-2 gap-2 overflow-y-auto rounded-2xl bg-paper p-2 shadow-xl">
          {BRUSHES.map((item) => (
            <button key={item.id} type="button" onClick={() => pick(() => { setBrush(item.id); setTool("draw"); })} className={cn("min-h-14 rounded-xl px-3 py-2 text-left", tool === "draw" && brush === item.id ? "bg-night text-paper" : "bg-white text-ink")}>
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className={cn("block text-xs leading-tight", tool === "draw" && brush === item.id ? "text-paper/70" : "text-muted")}>{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
      {menu === "shapes" ? (
        <div className="absolute inset-x-0 bottom-full mb-2 grid max-h-[50dvh] gap-2 overflow-y-auto rounded-2xl bg-paper p-3 shadow-xl">
          <p className="px-1 text-xs text-muted">Выберите фигуру: она встанет на страницу. Её можно залить, оставить контуром и растянуть.</p>
          <div className="grid grid-cols-3 gap-2">
            {SHAPES.map((item) => (
              <button key={item.id} type="button" onClick={() => pick(() => onAddShape(item.id as ShapeKind))} className="min-h-12 rounded-xl bg-white px-2 py-2 text-center text-sm font-semibold text-ink">
                {item.label}
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={straight} onClick={() => setStraight(!straight)} className={cn("flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-left", straight ? "bg-night text-paper" : "bg-white text-ink")}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Только прямые линии</span>
              <span className={cn("block text-xs leading-tight", straight ? "text-paper/70" : "text-muted")}>Всё, что рисуете пером, будет прямой линией</span>
            </span>
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <Hint id="draw-brush"><BarBtn active={tool === "draw"} label="Выбрать кисть" onClick={() => setMenu(menu === "brush" ? null : "brush")}>
          <PenLine className="size-4" /> {current.label} ▾
        </BarBtn></Hint>
        <Hint id="draw-erase"><BarBtn active={erasing} label="Ластик" onClick={() => pick(() => setTool("erase"))}>
          <Eraser className="size-4" /> <span className="max-[400px]:hidden">Ластик</span>
        </BarBtn></Hint>
        <Hint id="draw-fill"><BarBtn active={tool === "fill"} label="Нажмите внутрь замкнутого контура: он закрасится выбранным цветом" onClick={() => pick(() => setTool("fill"))}>
          <PaintBucket className="size-4" /> <span className="max-[400px]:hidden">Заливка</span>
        </BarBtn></Hint>
        <Hint id="draw-shapes"><BarBtn active={anyShape || menu === "shapes"} label="Фигуры: выбрать из списка" onClick={() => setMenu(menu === "shapes" ? null : "shapes")}>
          ◇ <span className="max-[400px]:hidden">Фигуры</span>
        </BarBtn></Hint>
        <span className="min-w-0 flex-1" />
        <Button className="min-h-11 shrink-0 px-5" onClick={onDone}>
          Готово
        </Button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" aria-label="Цвет" onClick={onColor} className="size-11 shrink-0 rounded-full border-[3px] border-white shadow ring-1 ring-ink/20" style={{ background: erasing ? "#fff" : color }}>
          {erasing ? <Eraser className="m-auto size-4 text-ink/75" /> : null}
        </button>
        <Hint id="draw-pipette"><button type="button" aria-label="Пипетка: взять цвет со страницы" onClick={onPipette} className="grid size-11 shrink-0 place-items-center rounded-full bg-white/80 text-ink">
          <Pipette className="size-4" />
        </button></Hint>
        <div className="min-w-0 flex-1">
          <Stepper label={erasing ? "Ластик" : "Кисть"} value={erasing ? eraserPx : sizePx} min={1} max={erasing ? 150 : 140} onChange={erasing ? setEraserPx : setSizePx} />
        </div>
      </div>
      {/* Подсказка занимает одну строку фиксированной высоты, поэтому панель не растёт. */}
      <p className="mt-1 h-4 truncate px-1 text-[11px] leading-4 text-muted">{hint}</p>
    </div>
  );
}

// ——— Панель выделенного: корзина первая ———

export function BlockBar({ block, busy, ops, onInspector }: { block: PageBlock; busy: boolean; ops: BlockOps; onInspector: () => void }) {
  const [colors, setColors] = useState<null | "text" | "shape-fill" | "shape-stroke" | "ink">(null);
  const [more, setMore] = useState(false);
  const locked = Boolean(block.locked);
  return (
    <div className="glass-strong no-scrollbar mx-auto flex max-w-xl items-center gap-1.5 overflow-x-auto rounded-full p-1.5">
      <BarBtn label="Удалить" danger wide={false} onClick={ops.remove}>
        <Trash2 className="size-4" />
      </BarBtn>
      <BarBtn label="Копия" onClick={ops.duplicate}>
        <Copy className="size-4" /> Копия
      </BarBtn>
      <BarBtn phoneHidden label={locked ? "Разблокировать" : "Закрепить: не будет двигаться"} active={locked} onClick={ops.toggleLock}>
        {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />} {locked ? "Снять" : "Закрепить"}
      </BarBtn>
      <BarBtn phoneHidden label="Слой выше (на шаг)" onClick={() => ops.layer("up")}>
        <BringToFront className="size-4" /> Выше
      </BarBtn>
      <BarBtn phoneHidden label="Слой ниже" onClick={() => ops.layer("down")}>
        <SendToBack className="size-4" /> Ниже
      </BarBtn>
      <span className="mx-0.5 h-6 w-px shrink-0 bg-ink/15" />
      {block.type === "text" ? (
        <>
          <BarBtn onClick={ops.edit} active>
            <PenLine className="size-4" /> Писать
          </BarBtn>
          <BarBtn onClick={() => setColors("text")}>
            <span className="size-4 rounded-full border border-ink/20" style={{ background: lookColors(block.look, block.color, block.bg)[block.look === "card" || block.look === "pill" ? "bg" : "fg"] }} /> Цвет
          </BarBtn>
          {(["left", "center", "right"] as const).map((align) => (
            <BarBtn key={align} wide={false} label={align === "left" ? "По левому краю" : align === "center" ? "По центру" : "По правому краю"} active={(block.align ?? "left") === align} onClick={() => ops.patch({ align } as Partial<PageBlock>)}>
              {align === "left" ? <AlignLeft className="size-4" /> : align === "center" ? <AlignCenter className="size-4" /> : <AlignRight className="size-4" />}
            </BarBtn>
          ))}
          {block.look !== "card" && block.look !== "pill" ? (
            <BarBtn label="Текст обтекает фото и стикеры" active={Boolean(block.wrap)} onClick={() => ops.patch({ wrap: !block.wrap } as Partial<PageBlock>)}>
              Обтекание
            </BarBtn>
          ) : null}
        </>
      ) : null}
      {block.type === "photo" ? (
        <>
          {!(block.frame === "sticker" && block.cut) ? (
            <BarBtn onClick={() => ops.cut("auto")} disabled={busy} active>
              <Scissors className="size-4" /> Убрать фон
            </BarBtn>
          ) : (
            <BarBtn onClick={() => ops.patch({ frame: "polaroid" } as Partial<PageBlock>)}>Вернуть фон</BarBtn>
          )}
          <BarBtn onClick={ops.cropMode} active={ops.cropping} label="Выбрать, какая часть фото видна">
            <Crop className="size-4" /> Кадр
          </BarBtn>
          <BarBtn onClick={ops.replace} label="Заменить фото на другое с теми же настройками">
            <Replace className="size-4" /> Заменить
          </BarBtn>
          <BarBtn phoneHidden onClick={() => ops.patch({ shadow: block.shadow === false } as Partial<PageBlock>)} active={block.shadow !== false} label="Тень под фото">
            <Droplet className="size-4" /> Тень
          </BarBtn>
          <BarBtn phoneHidden onClick={ops.write}>
            <Type className="size-4" /> Надпись
          </BarBtn>
          <BarBtn phoneHidden onClick={ops.full}>
            <Maximize className="size-4" /> На весь лист
          </BarBtn>
        </>
      ) : null}
      {block.type === "photo" || block.type === "ink" || block.type === "sticker" || block.type === "shape" ? (
        <BarBtn phoneHidden onClick={ops.toggleSpread} disabled={!ops.canSpread && !block.spread} active={Boolean(block.spread)} label="Лежит на двух страницах разворота">
          <BookOpen className="size-4" /> Через разворот
        </BarBtn>
      ) : null}
      {block.type === "slot" ? (
        <BarBtn onClick={ops.fill} active>
          Вставить фото
        </BarBtn>
      ) : null}
      {block.type === "shape" ? (
        <>
          <BarBtn onClick={() => setColors(isStrokedShape(block.shape) ? "shape-stroke" : "shape-fill")}>
            <span className="size-4 rounded-full border border-ink/20" style={{ background: isStrokedShape(block.shape) ? shapeStyle(block).stroke ?? "#000" : shapeStyle(block).fill ?? "#000" }} />
            {isStrokedShape(block.shape) ? "Цвет" : "Заливка"}
          </BarBtn>
          {!isStrokedShape(block.shape) ? (
            <BarBtn onClick={() => setColors("shape-stroke")}>Контур</BarBtn>
          ) : null}
        </>
      ) : null}
      {block.type === "ink" ? (
        <>
          <BarBtn onClick={() => setColors("ink")}>
            <span className="size-4 rounded-full border border-ink/20" style={{ background: block.strokes[0]?.color.startsWith("#") ? block.strokes[0].color : "#2a2420" }} /> Цвет
          </BarBtn>
          <BarBtn phoneHidden onClick={() => ops.inkScale(0.8)}>Тоньше</BarBtn>
          <BarBtn phoneHidden onClick={() => ops.inkScale(1.25)}>Толще</BarBtn>
        </>
      ) : null}
      {block.mask?.strokes.length ? (
        <BarBtn phoneHidden onClick={ops.resetMask} label="Вернуть всё, что стёрли ластиком">
          Вернуть стёртое
        </BarBtn>
      ) : null}
      {block.type !== "slot" ? (
        <BarBtn phoneHidden onClick={ops.erase} label="Стереть часть этого элемента ластиком">
          <Eraser className="size-4" /> Ластик
        </BarBtn>
      ) : null}
      <BarBtn phoneHidden label="Все свойства" onClick={onInspector}>
        <SlidersHorizontal className="size-4" /> Свойства
      </BarBtn>
      <button type="button" onClick={() => setMore(true)} className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-night px-4 text-[13px] font-semibold text-paper md:hidden">
        <SlidersHorizontal className="size-4" /> Ещё
      </button>
      {more ? (
        <Sheet title="Ещё" onClose={() => setMore(false)} dim={false}>
          <div className="grid grid-cols-2 gap-2 [&_button]:h-12 [&_button]:w-full [&_button]:justify-start [&_button]:rounded-2xl" onClickCapture={() => window.setTimeout(() => setMore(false), 0)}>
            <BarBtn label={locked ? "Разблокировать" : "Закрепить: не будет двигаться"} active={locked} onClick={ops.toggleLock}>
              {locked ? <Lock className="size-4" /> : <Unlock className="size-4" />} {locked ? "Снять" : "Закрепить"}
            </BarBtn>
            <BarBtn onClick={() => ops.layer("up")}>
              <BringToFront className="size-4" /> Слой выше
            </BarBtn>
            <BarBtn onClick={() => ops.layer("down")}>
              <SendToBack className="size-4" /> Слой ниже
            </BarBtn>
            {block.type === "photo" ? (
              <>
                <BarBtn onClick={() => ops.patch({ shadow: block.shadow === false } as Partial<PageBlock>)} active={block.shadow !== false}>
                  <Droplet className="size-4" /> Тень
                </BarBtn>
                <BarBtn onClick={ops.write}>
                  <Type className="size-4" /> Надпись
                </BarBtn>
                <BarBtn onClick={ops.full}>
                  <Maximize className="size-4" /> На весь лист
                </BarBtn>
              </>
            ) : null}
            {block.type === "photo" || block.type === "ink" || block.type === "sticker" || block.type === "shape" ? (
              <BarBtn onClick={ops.toggleSpread} disabled={!ops.canSpread && !block.spread} active={Boolean(block.spread)}>
                <BookOpen className="size-4" /> Через разворот
              </BarBtn>
            ) : null}
            {block.type === "ink" ? (
              <>
                <BarBtn onClick={() => ops.inkScale(0.8)}>Тоньше</BarBtn>
                <BarBtn onClick={() => ops.inkScale(1.25)}>Толще</BarBtn>
              </>
            ) : null}
            {block.mask?.strokes.length ? <BarBtn onClick={ops.resetMask}>Вернуть стёртое</BarBtn> : null}
            {block.type !== "slot" ? (
              <BarBtn onClick={ops.erase}>
                <Eraser className="size-4" /> Ластик
              </BarBtn>
            ) : null}
            <BarBtn onClick={onInspector}>
              <SlidersHorizontal className="size-4" /> Все свойства
            </BarBtn>
          </div>
        </Sheet>
      ) : null}
      {colors ? (
        <ColorSheet
          title={colors === "shape-stroke" ? "Цвет контура" : "Цвет"}
          value={
            colors === "text" && block.type === "text"
              ? block.color
              : block.type === "shape"
                ? colors === "shape-fill"
                  ? block.fill
                  : block.stroke
                : block.type === "ink"
                  ? block.strokes[0]?.color
                  : undefined
          }
          allowNone={colors === "shape-fill" || colors === "shape-stroke"}
          onNone={() => ops.patch((colors === "shape-fill" ? { fill: undefined } : { stroke: undefined }) as Partial<PageBlock>)}
          onPick={(c) => {
            if (colors === "text") ops.patch((block.type === "text" && (block.look === "card" || block.look === "pill") ? { bg: c } : { color: c }) as Partial<PageBlock>, `color:${block.id}`);
            else if (colors === "shape-fill") ops.patch({ fill: c } as Partial<PageBlock>, `color:${block.id}`);
            else if (colors === "shape-stroke") ops.patch({ stroke: c } as Partial<PageBlock>, `color:${block.id}`);
            else ops.inkColor(c);
          }}
          onClose={() => setColors(null)}
          onPipette={() => {
            const which = colors;
            setColors(null);
            ops.pickPipette((c) => {
              if (which === "text") ops.patch((block.type === "text" && (block.look === "card" || block.look === "pill") ? { bg: c } : { color: c }) as Partial<PageBlock>);
              else if (which === "shape-fill") ops.patch({ fill: c } as Partial<PageBlock>);
              else if (which === "shape-stroke") ops.patch({ stroke: c } as Partial<PageBlock>);
              else ops.inkColor(c);
            });
          }}
        />
      ) : null}
    </div>
  );
}

// ——— Все свойства ———

const BLENDS: { id: BlendKind | undefined; label: string }[] = [
  { id: undefined, label: "Обычный" },
  { id: "multiply", label: "Умножение" },
  { id: "screen", label: "Экран" },
  { id: "overlay", label: "Наложение" },
  { id: "soft-light", label: "Мягкий свет" },
  { id: "darken", label: "Тёмное" },
  { id: "lighten", label: "Светлое" },
];

export function Inspector({ block, ops, onClose }: { block: PageBlock; ops: BlockOps; onClose: () => void }) {
  const [colors, setColors] = useState<null | "fg" | "bg" | "fill" | "stroke">(null);
  const px = block.type === "text" ? (block.px ?? Math.round(textMetrics(block.font, block.size).size * 10)) : 0;
  return (
    <Sheet title="Свойства" onClose={onClose} dim={false}>
      <div className="grid gap-4">
        <Section title="Вид">
          <Stepper label="Прозрачность" unit="%" value={Math.round((block.opacity ?? 1) * 100)} min={5} max={100} step={5} onChange={(v) => ops.patch({ opacity: v >= 100 ? undefined : v / 100 } as Partial<PageBlock>, `op:${block.id}`)} />
          <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
            {BLENDS.map((item) => (
              <BarBtn key={item.label} active={block.blend === item.id} onClick={() => ops.patch({ blend: item.id } as Partial<PageBlock>)}>
                {item.label}
              </BarBtn>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">«Умножение» хорошо для текстур и бумажных футажей: белое исчезает, остаётся рисунок.</p>
        </Section>

        {block.type === "text" ? (
          <Section title="Текст">
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              <FontChips value={block.font} onPick={(font) => ops.patch({ font } as Partial<PageBlock>)} onMore={ops.openFonts} sample={block.text} />
            </div>
            <div className="mt-2">
              <Stepper label="Размер" value={px} min={10} max={300} onChange={(v) => ops.patch({ px: v } as Partial<PageBlock>, `size:${block.id}`)} />
              <div className="mt-1.5">
                <Stepper label="Пробелы" unit="%" value={Math.round((block.wordGap ?? 0) * 100)} min={-20} max={250} step={5} onChange={(v) => ops.patch({ wordGap: v === 0 ? undefined : v / 100 } as Partial<PageBlock>, `gap:${block.id}`)} />
              </div>
              <button
                type="button"
                className="mt-1.5 text-sm text-rose-deep underline"
                onClick={() => {
                  const state = useRod.getState();
                  let count = 0;
                  for (const page of state.pages) {
                    if (!page.blocks.some((item) => item.type === "text" && item.id !== block.id)) continue;
                    state.updatePage(page.id, (current) => ({
                      ...current,
                      blocks: current.blocks.map((item) => {
                        if (item.type !== "text") return item;
                        count += 1;
                        return { ...item, px };
                      }),
                    }));
                  }
                  ops.patch({ px } as Partial<PageBlock>);
                  toast(`Размер ${px} px поставлен на ${count + 1} текстах книги`);
                }}
              >
                Поставить {px} px на все тексты книги
              </button>
              <button
                type="button"
                className="mt-1 block text-sm text-rose-deep underline"
                onClick={() => {
                  const owner = useRod.getState().pages.find((page) => page.blocks.some((item) => item.id === block.id));
                  const made = owner ? flowToNextPages(owner.id, block.id) : 0;
                  toast(made ? `Лишнее перенесено на ${made} ${made === 1 ? "новую страницу" : "новые страницы"}` : "Весь текст помещается на странице");
                }}
              >
                Что не поместилось, перенести на следующую страницу
              </button>
            </div>
            <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
              {(["plain", "card", "pill"] as TextLook[]).map((look) => (
                <BarBtn key={look} active={(block.look ?? "plain") === look} onClick={() => ops.patch({ look } as Partial<PageBlock>)}>
                  {look === "plain" ? "Без фона" : look === "card" ? "Карточка" : "Плашка"}
                </BarBtn>
              ))}
              <BarBtn onClick={() => setColors("fg")}>Цвет букв</BarBtn>
              {block.look === "card" || block.look === "pill" ? <BarBtn onClick={() => setColors("bg")}>Цвет фона</BarBtn> : null}
            </div>
          </Section>
        ) : null}

        {block.type === "photo" ? (
          <Section title="Фото">
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {(["polaroid", "sticker", "tape", "none"] as PhotoFrame[]).map((frame) => (
                <BarBtn key={frame} active={block.frame === frame && !(frame === "sticker" && block.cut)} onClick={() => ops.patch({ frame } as Partial<PageBlock>)}>
                  {frame === "polaroid" ? "Полароид" : frame === "sticker" ? "Кайма" : frame === "tape" ? "Скотч" : "Просто фото"}
                </BarBtn>
              ))}
            </div>
            <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
              <BarBtn onClick={() => ops.cut("auto")}>
                <Scissors className="size-4" /> Убрать фон
              </BarBtn>
              <BarBtn onClick={() => ops.cut("precise")}>Убрать фон точнее</BarBtn>
              <BarBtn onClick={ops.cropMode}>
                <Crop className="size-4" /> Кадр
              </BarBtn>
              <BarBtn onClick={ops.replace}>
                <Replace className="size-4" /> Заменить
              </BarBtn>
            </div>
            {block.crop ? (
              <div className="mt-2">
                <Stepper label="Приближение" unit="×" step={0.1} value={Math.round((block.crop.z ?? 1) * 10) / 10} min={1} max={6} onChange={(z) => ops.patch({ crop: { ...block.crop!, z } } as Partial<PageBlock>, `crop:${block.id}`)} />
                <button type="button" className="mt-1 text-xs text-rose-deep underline" onClick={() => ops.patch({ crop: undefined } as Partial<PageBlock>)}>
                  Показать фото целиком
                </button>
              </div>
            ) : null}
          </Section>
        ) : null}

        {block.type === "shape" ? (
          <Section title="Фигура">
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
              {SHAPES.map((item) => (
                <BarBtn key={item.id} active={block.shape === item.id} onClick={() => ops.patch({ shape: item.id as ShapeKind } as Partial<PageBlock>)}>
                  {item.label}
                </BarBtn>
              ))}
            </div>
            <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
              {!isStrokedShape(block.shape) ? <BarBtn onClick={() => setColors("fill")}>Заливка</BarBtn> : null}
              <BarBtn onClick={() => setColors("stroke")}>{isStrokedShape(block.shape) ? "Цвет" : "Контур"}</BarBtn>
            </div>
            <div className="mt-2">
              <Stepper label={isStrokedShape(block.shape) ? "Толщина" : "Контур"} value={w2px(shapeStyle(block).strokeW)} min={0} max={60} step={0.5} onChange={(v) => ops.patch({ strokeW: px2w(v) } as Partial<PageBlock>, `sw:${block.id}`)} />
            </div>
          </Section>
        ) : null}

        <Section title="Положение">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            <BarBtn onClick={ops.centerH}>↔ По центру страницы</BarBtn>
            <BarBtn onClick={ops.centerV}>↕ По центру по высоте</BarBtn>
            {block.rotate ? <BarBtn onClick={() => ops.patch({ rotate: 0 } as Partial<PageBlock>)}>Выпрямить</BarBtn> : null}
            <BarBtn onClick={() => ops.layer("top")}>В самый верх</BarBtn>
            <BarBtn onClick={() => ops.layer("bottom")}>В самый низ</BarBtn>
            <BarBtn active={Boolean(block.locked)} onClick={ops.toggleLock}>
              {block.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />} {block.locked ? "Заблокирован" : "Заблокировать"}
            </BarBtn>
          </div>
        </Section>
      </div>
      <Button className="mt-4 w-full" onClick={onClose}>
        Готово
      </Button>
      {colors && (block.type === "text" || block.type === "shape") ? (
        <ColorSheet
          title="Цвет"
          value={block.type === "text" ? (colors === "fg" ? block.color : block.bg) : colors === "fill" ? block.fill : block.stroke}
          allowNone={block.type === "shape"}
          onNone={() => ops.patch((colors === "fill" ? { fill: undefined } : { stroke: undefined }) as Partial<PageBlock>)}
          onPick={(c) => ops.patch((colors === "fg" ? { color: c } : colors === "bg" ? { bg: c } : colors === "fill" ? { fill: c } : { stroke: c }) as Partial<PageBlock>, `color:${block.id}`)}
          onClose={() => setColors(null)}
          onPipette={() => {
            const which = colors;
            setColors(null);
            ops.pickPipette((c) => ops.patch((which === "fg" ? { color: c } : which === "bg" ? { bg: c } : which === "fill" ? { fill: c } : { stroke: c }) as Partial<PageBlock>));
          }}
        />
      ) : null}
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted">{title}</h3>
      {children}
    </section>
  );
}
