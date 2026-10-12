import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Camera, ClipboardPaste, FileUp, Images, Lock, Mic, ScanLine, Search, Trash2, Unlock, Upload } from "lucide-react";
import { toast } from "sonner";
import { ArchiveThumb, BarBtn, BigChoice, PinIcon } from "@/components/rod/editor-ui";
import { Button, Sheet } from "@/components/rod/chrome";
import { importFont } from "@/lib/rod/fonts";
import { startDictation, type Dictation } from "@/lib/rod/dictate";
import { useMedia } from "@/lib/rod/media";
import { STICKERS, STICKER_ORDER, fontFamily, stickerUrl } from "@/lib/rod/page-style";
import { SHAPES } from "@/lib/rod/shapes";
import { useRod } from "@/lib/rod/store";
import type { PageBlock, ShapeKind, StickerKind } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

export type PhotoStyle = "cutout" | "polaroid" | "none" | "tape" | "sticker" | "full";
export const STYLES: { id: PhotoStyle; label: string }[] = [
  { id: "cutout", label: "Стикер без фона" },
  { id: "polaroid", label: "Полароид" },
  { id: "sticker", label: "С белой каймой" },
  { id: "tape", label: "На скотче" },
  { id: "none", label: "Просто фото" },
  { id: "full", label: "На всю страницу" },
];

// ——— Фото ———

export function PhotoSheet({
  title,
  style,
  setStyle,
  shadow,
  setShadow,
  lockStyle,
  archive,
  bleed,
  onGallery,
  onFiles,
  onCamera,
  onPaste,
  onPinterest,
  onScan,
  onArchive,
  onClose,
}: {
  title: string;
  style: PhotoStyle;
  setStyle: (style: PhotoStyle) => void;
  shadow: boolean;
  setShadow: (v: boolean) => void;
  /** Заменяем фото или кладём в рамку: способ укладки уже выбран. */
  lockStyle: boolean;
  archive: { id: string; dataUrl: string; who: string }[];
  bleed: number;
  onGallery: () => void;
  onFiles: () => void;
  onCamera: () => void;
  onPaste: () => void;
  onPinterest: () => void;
  onScan: () => void;
  onArchive: (src: string) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title={title} onClose={onClose}>
      {!lockStyle ? (
        <>
          <p className="mb-2 text-sm text-muted">Как положить</p>
          <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {STYLES.map((item) => (
              <button key={item.id} type="button" onClick={() => setStyle(item.id)} className={cn("shrink-0 rounded-full px-4 py-2 text-sm font-medium", style === item.id ? "bg-night text-paper" : "bg-white/70 text-ink")}>
                {item.label}
              </button>
            ))}
          </div>
          <label className="mb-4 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={shadow} onChange={(event) => setShadow(event.target.checked)} className="size-5 accent-[var(--color-night)]" />
            Добавлять тень под фото (по умолчанию без неё: стык с фоном и соседней страницей бесшовный)
          </label>
        </>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <BigChoice icon={<Images className="size-5" />} title="Из галереи" text="Фото на телефоне, можно несколько" onClick={onGallery} />
        <BigChoice icon={<FileUp className="size-5" />} title="Из файлов" text="Папка «Файлы», iCloud, Google Диск" onClick={onFiles} />
        <BigChoice icon={<Camera className="size-5" />} title="Камера" text="Снять старое фото" onClick={onCamera} />
        <BigChoice icon={<ScanLine className="size-5" />} title="Сканер" text="Ровняет углы, убирает блики, берёт почерк" onClick={onScan} />
        <BigChoice icon={<ClipboardPaste className="size-5" />} title="Вставить" text="Скопированную картинку" onClick={onPaste} />
        <BigChoice icon={<PinIcon />} title="Pinterest" text="Найти и перетащить" onClick={onPinterest} />
      </div>
      {archive.length > 0 ? (
        <>
          <p className="mb-2 mt-4 text-sm text-muted">Из архива семьи</p>
          <ul className="grid grid-cols-4 gap-2">
            {archive.map((photo) => (
              <li key={photo.id}>
                <ArchiveThumb src={photo.dataUrl} alt={photo.who} onClick={() => onArchive(photo.dataUrl)} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {style === "full" && !lockStyle ? <p className="mt-4 rounded-2xl bg-blush/70 p-3 text-xs text-ink">⚠️ Фото ляжет на весь лист под обрез. В типографии края срежутся на {bleed} мм с каждой стороны, а не квадратное фото обрежется до квадрата. Важное держите внутри пунктира. Какую часть фото показать, выберете кнопкой «Кадр».</p> : null}
      {style === "cutout" && !lockStyle ? <p className="mt-4 text-xs text-muted">Фон уберётся сам, фото ляжет стикером. В первый раз вырезка скачивается около минуты.</p> : null}
    </Sheet>
  );
}

// ——— Стикеры, фигуры, свои ———

type Tab = "stickers" | "pack" | "shapes" | "mine" | "text";

export type PackItem = { id: string; label: string; cat: string; file: string; kind: "sticker" | "background" };

/** Готовый набор футажей приложения (конверты, цветы, ветки, бумага, фоны). */
function usePack(): PackItem[] | null {
  const [items, setItems] = useState<PackItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch("stickers/pack/index.json")
      .then((res) => (res.ok ? (res.json() as Promise<PackItem[]>) : []))
      .catch(() => [] as PackItem[])
      .then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, []);
  return items;
}

export function StickersSheet({
  onSticker,
  onShape,
  onUser,
  onPack,
  onUpload,
  onText,
  onClose,
}: {
  onSticker: (kind: StickerKind) => void;
  onShape: (shape: ShapeKind) => void;
  onUser: (ref: string) => void;
  onPack: (item: PackItem) => void;
  onUpload: () => void;
  onText: (look: "card" | "pill" | "title") => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("mine");
  const pack = usePack();
  const mine = useRod((state) => state.userStickers);
  const remove = useRod((state) => state.removeUserSticker);
  return (
    <Sheet title="Стикеры" onClose={onClose}>
      <div className="no-scrollbar -mx-1 mb-3 flex gap-2 overflow-x-auto px-1">
        {(
          [
            ["mine", `Мои${mine.length ? ` · ${mine.length}` : ""}`],
            ["stickers", "Стикеры"],
            ["pack", "Футажи"],
            ["shapes", "Фигуры и стрелки"],
            ["text", "Надписи"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <BarBtn key={id} active={tab === id} onClick={() => setTab(id)}>
            {label}
          </BarBtn>
        ))}
      </div>
      {tab === "stickers" ? (
        <ul className="grid grid-cols-4 gap-3">
          {STICKER_ORDER.map((kind) => (
            <li key={kind}>
              <button type="button" className="grid aspect-square w-full place-items-center rounded-2xl bg-white/70 p-3" onClick={() => onSticker(kind)}>
                <img src={stickerUrl(kind)} alt={STICKERS[kind].label} className="max-h-full w-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {tab === "pack" ? (
        pack === null ? (
          <p className="text-sm text-muted">Загружаю…</p>
        ) : pack.length === 0 ? (
          <p className="text-sm text-muted">Набор не загрузился. Проверьте интернет и откройте снова.</p>
        ) : (
          <div className="grid gap-4">
            {[...new Set(pack.map((item) => item.cat))].map((cat) => (
              <section key={cat}>
                <p className="mb-1.5 text-sm font-medium text-ink">{cat}</p>
                <ul className="grid grid-cols-4 gap-2">
                  {pack
                    .filter((item) => item.cat === cat)
                    .map((item) => (
                      <li key={item.id}>
                        <button type="button" title={item.label} onClick={() => onPack(item)} className="checker grid aspect-square w-full place-items-center overflow-hidden rounded-2xl p-1">
                          <img src={item.file} alt={item.label} loading="lazy" className={item.kind === "background" ? "h-full w-full rounded-xl object-cover" : "max-h-full max-w-full object-contain"} />
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
            <p className="text-xs text-muted">Фоны ложатся на весь лист (дальше «Кадр» выберет часть). Остальное это вырезки: двигаются, тянутся, любой слой. Режим «Умножение» в «Ещё» убирает белое у бумаги.</p>
          </div>
        )
      ) : null}
      {tab === "shapes" ? (
        <>
          <ul className="grid grid-cols-4 gap-3">
            {SHAPES.map((item) => (
              <li key={item.id}>
                <button type="button" className="grid aspect-square w-full place-items-center rounded-2xl bg-white/70 p-2 text-center text-[11px] font-medium text-ink" onClick={() => onShape(item.id)}>
                  <ShapeIcon shape={item.id} />
                  <span className="mt-1 leading-tight">{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">Фигуры тянутся за уголок как угодно, заливка и контур любого цвета (кнопка «Заливка» над панелью).</p>
        </>
      ) : null}
      {tab === "mine" ? (
        <>
          <Button className="mb-3 w-full" onClick={onUpload}>
            <Upload className="size-4" /> Добавить из файлов
          </Button>
          {mine.length === 0 ? (
            <p className="text-sm text-muted">Здесь будут ваши стикеры и футажи: PNG с прозрачным фоном, WebP, GIF, SVG. Бумажные текстуры лучше ложатся с режимом «Умножение» (Свойства → Вид).</p>
          ) : (
            <ul className="grid grid-cols-4 gap-3">
              {mine.map((ref) => (
                <li key={ref} className="relative">
                  <MineThumb src={ref} onClick={() => onUser(ref)} />
                  <button type="button" aria-label="Убрать из моих" className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-night/80 text-paper" onClick={() => remove(ref)}>
                    <Trash2 className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      {tab === "text" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => onText("card")}>
            Чёрная карточка
          </Button>
          <Button variant="soft" onClick={() => onText("pill")}>
            Плашка
          </Button>
          <Button variant="soft" onClick={() => onText("title")}>
            Заголовок
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}

function MineThumb({ src, onClick }: { src: string; onClick: () => void }) {
  const url = useMedia(src);
  return (
    <button type="button" onClick={onClick} className="checker grid aspect-square w-full place-items-center overflow-hidden rounded-2xl p-1">
      {url ? <img src={url} alt="Мой стикер" className="max-h-full max-w-full object-contain" /> : null}
    </button>
  );
}

export function ShapeIcon({ shape }: { shape: ShapeKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const solid = { fill: "currentColor", stroke: "none" };
  return (
    <svg viewBox="0 0 48 48" className="size-9 text-rose-deep" aria-hidden>
      {shape === "rect" ? <rect x="8" y="8" width="32" height="32" {...solid} /> : null}
      {shape === "round" ? <rect x="7" y="9" width="34" height="30" rx="9" {...solid} /> : null}
      {shape === "ellipse" ? <circle cx="24" cy="24" r="17" {...solid} /> : null}
      {shape === "triangle" ? <path d="M24 7L42 40H6z" {...solid} /> : null}
      {shape === "diamond" ? <path d="M24 5L43 24 24 43 5 24z" {...solid} /> : null}
      {shape === "star" ? <path d="M24 5l5.5 12.6 13.5 1.2-10.2 9 3.1 13.4L24 34l-11.9 7.2 3.1-13.4-10.2-9 13.5-1.2z" {...solid} /> : null}
      {shape === "heart" ? <path d="M24 41C9 31 5 23 6 16c1-6 6-9 11-8 3 .5 5 2.5 7 5 2-2.5 4-4.5 7-5 5-1 10 2 11 8 1 7-3 15-18 25z" {...solid} /> : null}
      {shape === "burst" ? <path d="M24 3l4 8 8-4 1 9 9 1-4 8 8 4-8 4 4 8-9 1-1 9-8-4-4 8-4-8-8 4-1-9-9-1 4-8-8-4 8-4-4-8 9-1 1-9 8 4z" {...solid} /> : null}
      {shape === "dot" ? <circle cx="24" cy="24" r="7" {...solid} /> : null}
      {shape === "ring" ? <circle cx="24" cy="24" r="16" {...common} /> : null}
      {shape === "cross" ? <path d="M24 8v32M8 24h32" {...common} /> : null}
      {shape === "line" ? <path d="M6 24h36" {...common} /> : null}
      {shape === "arrow" ? <path d="M6 24h36M30 12l12 12-12 12" {...common} /> : null}
      {shape === "arrow2" ? <path d="M6 24h36M16 12L4 24l12 12M32 12l12 12-12 12" {...common} /> : null}
      {shape === "curve" ? <path d="M6 38C10 12 28 8 40 14M30 6l10 8-9 8" {...common} /> : null}
      {shape === "dots" ? <path d="M6 24h36" {...common} strokeDasharray="0 7" strokeWidth={5} /> : null}
      {shape === "stitch" ? <path d="M6 24h36" {...common} strokeDasharray="7 5" /> : null}
    </svg>
  );
}

// ——— Слои ———

function blockLabel(block: PageBlock): string {
  if (block.type === "text") return block.text.trim() ? block.text.trim().slice(0, 28) : block.placeholder ? "Пустой текст (подсказка)" : "Пустой текст";
  if (block.type === "photo") return block.frame === "sticker" && block.cut ? "Фото без фона" : "Фото";
  if (block.type === "slot") return "Рамка для фото";
  if (block.type === "sticker") return STICKERS[block.kind === "bubble" ? "sparkle" : block.kind].label;
  if (block.type === "shape") return SHAPES.find((s) => s.id === block.shape)?.label ?? "Фигура";
  if (block.type === "ink") return "Рисунок";
  return "Элемент";
}

function LayerThumb({ block }: { block: PageBlock }) {
  const src = useMedia(block.type === "photo" ? (block.cut ?? block.src) : "");
  if (block.type === "photo") return src ? <img src={src} alt="" className="size-10 shrink-0 rounded-lg object-cover" /> : <span className="size-10 shrink-0 rounded-lg bg-line" />;
  if (block.type === "sticker") return <img src={stickerUrl(block.kind)} alt="" className="size-10 shrink-0 object-contain" />;
  if (block.type === "shape") return <span className="grid size-10 shrink-0 place-items-center"><ShapeIcon shape={block.shape} /></span>;
  return <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/80 text-sm font-semibold text-ink">{block.type === "text" ? "Aa" : block.type === "ink" ? "✎" : "▢"}</span>;
}

/** Все элементы страницы сверху вниз. Здесь можно выбрать скрытое под фото, поменять порядок, заблокировать, убрать. */
export function LayersSheet({
  blocks,
  selected,
  onSelect,
  onMove,
  onLock,
  onRemove,
  onClose,
}: {
  blocks: PageBlock[];
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, where: "up" | "down") => void;
  onLock: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const list = blocks.map((block, index) => ({ block, index })).reverse();
  return (
    <Sheet title="Слои" onClose={onClose} dim={false}>
      <p className="mb-2 text-sm text-muted">Сверху тот, что поверх всех. Нажмите на строку, чтобы выбрать элемент, даже если он закрыт фото. Замок: элемент не двигается и не мешает соседям.</p>
      {list.length === 0 ? <p className="py-6 text-center text-sm text-muted">На странице пока ничего нет.</p> : null}
      <ul className="grid gap-1.5">
        {list.map(({ block, index }) => (
          <li key={block.id} className={cn("flex items-center gap-2 rounded-2xl bg-white/70 p-1.5", selected === block.id && "ring-2 ring-night")}>
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => onSelect(block.id)}>
              <LayerThumb block={block} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{blockLabel(block)}</span>
                <span className="block text-[11px] text-muted">{block.locked ? "заблокирован · " : ""}слой {blocks.length - index}</span>
              </span>
            </button>
            <button type="button" aria-label="Выше" disabled={index === blocks.length - 1} className="grid size-9 place-items-center rounded-full disabled:opacity-30" onClick={() => onMove(block.id, "up")}>
              <ArrowUp className="size-4" />
            </button>
            <button type="button" aria-label="Ниже" disabled={index === 0} className="grid size-9 place-items-center rounded-full disabled:opacity-30" onClick={() => onMove(block.id, "down")}>
              <ArrowDown className="size-4" />
            </button>
            <button type="button" aria-label={block.locked ? "Разблокировать" : "Заблокировать"} className={cn("grid size-9 place-items-center rounded-full", block.locked && "bg-night text-paper")} onClick={() => onLock(block.id)}>
              {block.locked ? <Lock className="size-4" /> : <Unlock className="size-4" />}
            </button>
            <button type="button" aria-label="Удалить" className="grid size-9 place-items-center rounded-full text-rose-deep" onClick={() => onRemove(block.id)}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <Button className="mt-3 w-full" onClick={onClose}>
        Готово
      </Button>
    </Sheet>
  );
}

// ——— Свои шрифты ———

export function FontsSheet({ onClose, onUse }: { onClose: () => void; onUse: (font: `custom:${string}`) => void }) {
  const fonts = useRod((state) => state.fonts);
  const addFont = useRod((state) => state.addFont);
  const removeFont = useRod((state) => state.removeFont);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet title="Свои шрифты" onClose={onClose}>
      <p className="text-sm text-muted">Загрузите файл шрифта (.ttf, .otf, .woff). Так в книгу попадает чей-то почерк: например, бабушкин. Его можно собрать из сканов письма в сервисе Calligraphr, он бесплатный, а потом принести сюда файлом.</p>
      <Button className="mt-3 w-full" disabled={busy} onClick={() => input.current?.click()}>
        <Upload className="size-4" /> {busy ? "Загружаю…" : "Выбрать файл шрифта"}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".ttf,.otf,.woff,.woff2,font/*"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          setBusy(true);
          void importFont(file)
            .then((entry) => {
              addFont(entry);
              toast(`Шрифт «${entry.name}» добавлен`);
            })
            .catch((error: unknown) => toast(error instanceof Error ? error.message : "Шрифт не открылся"))
            .finally(() => setBusy(false));
        }}
      />
      <ul className="mt-3 grid gap-2">
        {fonts.map((font) => (
          <li key={font.id} className="flex items-center gap-2 rounded-2xl bg-white/70 p-3">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onUse(`custom:${font.id}`)}>
              <span className="block truncate text-2xl text-ink" style={{ fontFamily: fontFamily(`custom:${font.id}`) }}>
                Аа Бб Вв — {font.name}
              </span>
              <span className="text-[11px] text-muted">Нажмите, чтобы написать этим шрифтом</span>
            </button>
            <button type="button" aria-label="Удалить шрифт" className="grid size-9 place-items-center rounded-full text-rose-deep" onClick={() => removeFont(font.id)}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Нет файла шрифта? В «Сканере» есть режим «Почерк»: он забирает написанное от руки на прозрачный фон, и надпись ложится на страницу как стикер.</p>
    </Sheet>
  );
}

// ——— Вставка и Pinterest ———

export function PasteSheet({ onClose, onPaste, onPasteData, onLink }: { onClose: () => void; onPaste: () => void; onPasteData: (data: DataTransfer) => void; onLink: (link: string) => void }) {
  const [link, setLink] = useState("");
  const field = useRef<HTMLDivElement>(null);
  useEffect(() => {
    field.current?.focus();
  }, []);
  return (
    <Sheet title="Вставить картинку" onClose={onClose}>
      <p className="text-sm text-ink">Скопируйте картинку (в «Фото» нажмите «Скопировать»), вернитесь сюда, <b>нажмите на поле и удерживайте</b>, выберите «Вставить».</p>
      <div
        ref={field}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Поле для вставки"
        onPaste={(event) => {
          event.preventDefault();
          onPasteData(event.clipboardData);
        }}
        onInput={(event) => {
          (event.currentTarget as HTMLDivElement).textContent = "";
        }}
        className="mt-3 grid min-h-24 place-items-center rounded-3xl border-2 border-dashed border-rose/50 bg-white/60 px-4 text-center text-sm text-ink outline-none focus:border-rose"
        data-placeholder="Нажмите и удерживайте здесь → «Вставить»"
      />
      <Button variant="soft" className="mt-3 w-full" onClick={onPaste}>
        <ClipboardPaste className="size-4" /> Или вставить кнопкой
      </Button>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (link.trim()) onLink(link.trim());
        }}
      >
        <input className="field" value={link} onChange={(event) => setLink(event.target.value)} placeholder="или ссылка на картинку" />
        <Button type="submit" variant="soft" disabled={!link.trim()}>
          Взять
        </Button>
      </form>
    </Sheet>
  );
}

export function PinterestPanel({ onClose, onPaste, onLink, onPasteData }: { onClose: () => void; onPaste: () => void; onLink: (link: string) => void; onPasteData: (data: DataTransfer) => void }) {
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const open = () => {
    const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query.trim() || "винтажные семейные фото")}`;
    const width = 460;
    const left = Math.max(0, window.screenX + window.outerWidth - width - 20);
    const win = window.open(url, "pinterest", `popup=yes,width=${width},height=${Math.min(900, window.outerHeight - 40)},left=${left},top=${window.screenY + 20}`);
    if (!win) window.location.assign(url);
  };
  return (
    <Sheet title="Pinterest" onClose={onClose}>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          open();
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input className="field !pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Что ищете? винтаж, рамки, цветы…" />
        </div>
        <Button type="submit">Найти</Button>
      </form>
      <div className="mt-4 grid gap-3 text-sm text-ink">
        <p>
          <b>Телефон, самый надёжный путь.</b> В приложении Pinterest нажмите на пин → «Поделиться» → «Копировать ссылку». Здесь вставьте ссылку в поле ниже, картинка скачается сама. Или в Pinterest нажмите «Сохранить фото» и добавьте его через «Из галереи».
        </p>
        <p>
          <b>Компьютер.</b> Pinterest откроется маленьким окном рядом, тащите картинку мышкой прямо на лист.
        </p>
        <p>
          <b>iPad.</b> Откройте Pinterest рядом (Split View) и перетащите фото пальцем на страницу.
        </p>
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (link.trim()) onLink(link.trim());
        }}
      >
        <input className="field" value={link} onChange={(event) => setLink(event.target.value)} placeholder="ссылка на пин (pin.it/… или pinterest.com/pin/…)" />
        <Button type="submit" disabled={!link.trim()}>
          Взять
        </Button>
      </form>
      <div
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Поле для вставки"
        onPaste={(event) => {
          event.preventDefault();
          onPasteData(event.clipboardData);
        }}
        onInput={(event) => {
          (event.currentTarget as HTMLDivElement).textContent = "";
        }}
        className="mt-4 grid min-h-20 place-items-center rounded-3xl border-2 border-dashed border-rose/50 bg-white/60 px-4 text-center text-sm text-ink outline-none focus:border-rose"
        data-placeholder="Нажмите и удерживайте здесь → «Вставить» (картинка или ссылка)"
      />
      <Button variant="soft" className="mt-3 w-full" onClick={onPaste}>
        <ClipboardPaste className="size-4" /> Вставить скопированную картинку
      </Button>
      <p className="mt-3 text-xs text-muted">Pinterest не разрешает открывать себя внутри других приложений, поэтому он открывается рядом. Если ссылка не скачалась, значит пин закрыт или Pinterest сменил адрес: сохраните фото и добавьте из галереи.</p>
    </Sheet>
  );
}

// ——— «Помочь заполнить» с диктовкой ———

export const GENERIC_QUESTIONS = [
  "О ком или о чём эта страница?",
  "Где и когда это было?",
  "Какая деталь до сих пор перед глазами?",
  "Какую фразу стоит сохранить дословно?",
  "Что должен узнать тот, кто откроет книгу позже?",
];

export function HelpSheet({ title, questions, onClose, onInsert }: { title: string; questions: string[]; onClose: () => void; onInsert: (text: string) => void }) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [heard, setHeard] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const live = useRef<Dictation | null>(null);
  useEffect(() => () => live.current?.stop(), []);
  const dictate = (index: number) => {
    if (live.current) {
      live.current.stop();
      return;
    }
    setHeard(index);
    live.current = startDictation({
      onStatus: setStatus,
      onText: (said) => setAnswers((list) => list.map((item, i) => (i === index ? `${item} ${said}`.trim() : item))),
      onError: (message) => toast(message, { duration: 9000 }),
      onEnd: () => {
        live.current = null;
        setHeard(null);
        setStatus("");
      },
    });
    if (!live.current) setHeard(null);
  };
  const filled = answers.filter((item) => item.trim());
  return (
    <Sheet title="Помочь заполнить" onClose={onClose}>
      <p className="text-sm text-muted">Ответьте коротко, как помните, можно голосом. Ответы лягут на страницу «{title}», потом можно поправить.</p>
      <div className="mt-3 grid gap-3">
        {questions.map((question, index) => (
          <label key={question} className="block">
            <span className="mb-1 flex items-start justify-between gap-2 text-sm font-medium text-ink">
              {question}
              <button type="button" className={cn("flex shrink-0 items-center gap-1 rounded-full px-2 py-1", heard === index ? "bg-rose-deep text-paper" : "text-rose-deep")} onClick={() => dictate(index)}>
                <Mic className="size-4" />
                {heard === index ? "Стоп" : "Голосом"}
              </button>
            </span>
            {heard === index && status ? <span className="mb-1 block text-xs text-rose-deep">{status}</span> : null}
            <textarea className="field min-h-14" value={answers[index] ?? ""} onChange={(event) => setAnswers((list) => list.map((item, i) => (i === index ? event.target.value : item)))} />
          </label>
        ))}
      </div>
      <Button className="mt-4 w-full" disabled={!filled.length} onClick={() => onInsert(filled.map((item) => item.trim().replace(/^./, (c) => c.toUpperCase())).join("\n\n"))}>
        Поставить на страницу
      </Button>
    </Sheet>
  );
}
