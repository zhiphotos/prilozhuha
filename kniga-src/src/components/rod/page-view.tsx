import { createContext, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { PAGE_H as INK_PAGE_H, inkColor as inkColorOf, strokeGeom } from "@/lib/rod/ink";
import { maskStyle } from "@/lib/rod/mask";
import { useMedia } from "@/lib/rod/media";
import {
  FONT_FAMILY,
  PAGE_RATIO,
  POLAROID,
  fontFamily,
  fontWeight,
  isDark,
  lookColors,
  lookPad,
  stickerRatio,
  stickerUrl,
  textMetrics,
} from "@/lib/rod/page-style";
import { cropGeom, innerBox } from "@/lib/rod/crop";
import { shapeParts, shapeStyle } from "@/lib/rod/shapes";
import { useGhosts } from "@/lib/rod/spread";
import type { BookPage, InkStroke, PageBlock, PaperKind } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

export type CoverMeta = { dedicatee: string; collector: string };

/** Тёмная страница: текст и карточки по умолчанию светлые. */
const DarkPage = createContext(false);

/** Высота страницы в единицах ширины (для координат по вертикали). */
export const PAGE_H = INK_PAGE_H;

export const inkColor = inkColorOf;

export function paperStyle(paper: PaperKind): CSSProperties {
  if (paper === "lined") {
    return {
      backgroundColor: "#fbf8f3",
      backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 6.6cqw, #e6ddd1 6.6cqw 6.8cqw)",
      backgroundPosition: "0 9cqw",
    };
  }
  if (paper === "dots") {
    return {
      backgroundColor: "#fbf8f3",
      backgroundImage: "radial-gradient(circle, #d9cfc2 0.32cqw, transparent 0.4cqw)",
      backgroundSize: "5cqw 5cqw",
    };
  }
  if (paper === "rose") return { backgroundColor: "#f8e4e8" };
  if (paper === "sage") return { backgroundColor: "#e7eee2" };
  if (paper === "kraft") return { backgroundColor: "#ece0cf" };
  return { backgroundColor: "#fbf8f3" };
}

/** Страница книги. Всё внутри меряется в cqw, поэтому миниатюра и печать выглядят одинаково. */
export function PageSheet({
  page,
  meta,
  className,
  children,
  editing = false,
  hideStrokes = false,
  clip = true,
  ghosts = true,
}: {
  page: BookPage;
  meta: CoverMeta;
  className?: string;
  children?: ReactNode;
  editing?: boolean;
  hideStrokes?: boolean;
  clip?: boolean;
  /** Показывать части фото, которые заходят с соседней страницы разворота. */
  ghosts?: boolean;
}) {
  const crossing = useGhosts(ghosts ? page.id : "");
  return (
    <DarkPage.Provider value={isDark(page.bg)}>
    <div
      className={cn("page-sheet relative w-full", clip && "overflow-hidden", className)}
      style={{ ...paperStyle(page.paper), ...(page.bg ? { backgroundColor: page.bg } : {}), aspectRatio: `1 / ${PAGE_RATIO}`, containerType: "inline-size" }}
    >
      {isDark(page.bg) ? null : <div className="paper-grain pointer-events-none absolute inset-0" />}
      {page.kind === "cover" && !page.designed ? <CoverArt meta={meta} /> : null}
      {crossing.map((block) => (
        <PlacedBlock key={block.id} block={block} className="pointer-events-none">
          <BlockArt block={block} />
        </PlacedBlock>
      ))}
      {children ?? (
        <>
          {page.blocks.map((block) => (
            <PlacedBlock key={block.id} block={block}>
              <BlockArt block={block} editing={editing} />
            </PlacedBlock>
          ))}
        </>
      )}
      {hideStrokes || !page.strokes.length ? null : <InkLayer strokes={page.strokes} />}
    </div>
    </DarkPage.Provider>
  );
}

export function CoverArt({ meta }: { meta: CoverMeta }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-[4cqw] rounded-[2cqw] border-[0.35cqw] border-[#8e3d52]/25" />
      <div className="absolute inset-x-0 top-[15%] text-center">
        <p style={{ fontFamily: FONT_FAMILY.sans, fontSize: "2.6cqw", letterSpacing: "0.6cqw" }} className="uppercase text-[#8e3d52]">
          семейная летопись
        </p>
        <p style={{ fontFamily: FONT_FAMILY.serif, fontWeight: 600, fontSize: "14cqw", lineHeight: 0.95 }} className="mt-[3cqw] text-[#2a2420]">
          Книга
          <br />
          рода
        </p>
        <img src={stickerUrl("branch")} alt="" className="mx-auto mt-[3cqw] w-[30cqw]" />
      </div>
      <div className="absolute inset-x-[8cqw] bottom-[10%] text-center">
        <p style={{ fontFamily: FONT_FAMILY.script, fontSize: "7cqw", lineHeight: 1 }} className="text-[#8e3d52]">
          {meta.dedicatee.trim() ? `для тебя, ${meta.dedicatee.trim()}` : "для тех, кто откроет позже"}
        </p>
        {meta.collector.trim() ? (
          <p style={{ fontFamily: FONT_FAMILY.sans, fontSize: "3cqw" }} className="mt-[2cqw] text-[#7a7067]">
            собрал(а) {meta.collector.trim()}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function StrokeShape({ stroke }: { stroke: InkStroke }) {
  const g = strokeGeom(stroke);
  if (!g.d) return null;
  return g.fill ? (
    <path d={g.d} fill={g.color} fillOpacity={g.alpha} />
  ) : (
    <path d={g.d} fill="none" stroke={g.color} strokeOpacity={g.alpha} strokeWidth={g.width} strokeDasharray={g.dash} strokeLinecap={g.cap} strokeLinejoin="round" />
  );
}

/** Старые чернила поверх всей страницы (новые рисунки — блоки «ink») и штрих, который рисуется прямо сейчас. */
export function InkLayer({ strokes, live }: { strokes: InkStroke[]; live?: InkStroke | null }) {
  return (
    <svg viewBox={`0 0 100 ${PAGE_H}`} className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
      {[...strokes, ...(live ? [live] : [])].map((stroke) => (
        <StrokeShape key={stroke.id} stroke={stroke} />
      ))}
    </svg>
  );
}

export function boxOf(block: PageBlock): { x: number; y: number; w: number; h: number | null; rotate: number } {
  const rotate = block.rotate ?? 0;
  if (block.type === "photo" || block.type === "slot" || block.type === "shape" || block.type === "ink") return { x: block.x, y: block.y, w: block.w, h: block.h, rotate };
  if (block.type === "sticker") return { x: block.x, y: block.y, w: block.w ?? 15, h: null, rotate };
  if (block.type === "text") return { x: block.x, y: block.y, w: block.w, h: null, rotate };
  return { x: block.x, y: block.y, w: 40, h: null, rotate };
}

export function PlacedBlock({
  block,
  children,
  className,
  style,
  ...rest
}: {
  block: PageBlock;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
} & React.HTMLAttributes<HTMLDivElement>) {
  const box = boxOf(block);
  return (
    <div
      className={cn("absolute z-10", className)}
      style={{
        left: `${box.x}%`,
        top: `${box.y}%`,
        width: `${box.w}%`,
        height: box.h === null ? undefined : `${box.h}%`,
        transform: box.rotate ? `rotate(${box.rotate}deg)` : undefined,
        mixBlendMode: block.blend,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Как блок выглядит. Без рамок выбора — их рисует редактор. Ластик (маска) и прозрачность действуют только на сам рисунок, не на рамки и кнопки выбора. */
export function BlockArt({ block, editing = false }: { block: PageBlock; editing?: boolean }) {
  const mask = maskStyle(block.mask);
  if (!mask && block.opacity === undefined) return <BlockArtInner block={block} editing={editing} />;
  return (
    <div className="h-full w-full" style={{ opacity: block.opacity, ...mask }}>
      <BlockArtInner block={block} editing={editing} />
    </div>
  );
}

function BlockArtInner({ block, editing = false }: { block: PageBlock; editing?: boolean }) {
  if (block.type === "text") return <TextArt block={block} editing={editing} />;
  if (block.type === "photo") return <PhotoArt block={block} />;
  if (block.type === "sticker") return <img src={stickerUrl(block.kind)} alt="" draggable={false} className="sticker-art block w-full select-none" style={{ aspectRatio: `1 / ${stickerRatio(block.kind)}` }} />;
  if (block.type === "slot") return editing ? <SlotArt block={block} /> : null;
  if (block.type === "shape") return <ShapeArt block={block} />;
  if (block.type === "ink") return <InkArt block={block} editing={editing} />;
  return null;
}

export function ShapeArt({ block }: { block: Extract<PageBlock, { type: "shape" }> }) {
  const style = shapeStyle(block);
  const parts = shapeParts(block.shape, block.w, (block.h * 100) / PAGE_H, style.strokeW);
  return (
    <svg viewBox={`0 0 ${block.w} ${(block.h * 100) / PAGE_H}`} className="block h-full w-full overflow-visible" preserveAspectRatio="none">
      {parts.map((part, i) => (
        <path
          key={i}
          d={part.d}
          fill={part.fill && style.fill ? style.fill : "none"}
          stroke={part.stroke && style.stroke ? style.stroke : "none"}
          strokeWidth={style.strokeW}
          strokeDasharray={part.dash}
          strokeLinecap={part.cap ?? "round"}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function InkArt({ block, editing }: { block: Extract<PageBlock, { type: "ink" }>; editing: boolean }) {
  return (
    <svg viewBox={`0 0 ${block.ow} ${block.oh}`} preserveAspectRatio="none" className="pointer-events-none block h-full w-full overflow-visible">
      {block.strokes.map((stroke) => (
        <StrokeShape key={stroke.id} stroke={stroke} />
      ))}
      {editing
        ? // Тонкую линию трудно поймать пальцем: невидимая «толстая» копия принимает нажатия.
          block.strokes.map((stroke) => (
            <polyline
              key={`hit-${stroke.id}`}
              data-hit="1"
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(stroke.width, 3.2)}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: "stroke" }}
              points={hitPoints(stroke.points)}
            />
          ))
        : null}
    </svg>
  );
}

function hitPoints(points: number[]) {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push(`${points[i]},${(points[i + 1] * PAGE_H) / 100}`);
  return pairs.join(" ");
}

export function TextArt({ block, editing }: { block: Extract<PageBlock, { type: "text" }>; editing: boolean }) {
  const metrics = textMetrics(block.font, block.size, block.px);
  const pad = lookPad(block.look);
  const dark = useContext(DarkPage);
  const colors = lookColors(block.look, block.color, block.bg, dark);
  const empty = !block.text.trim();
  if (empty && !editing) return null;
  return (
    <div
      style={{
        fontFamily: fontFamily(block.font),
        fontWeight: fontWeight(block.font),
        fontSize: `${metrics.size}cqw`,
        lineHeight: metrics.leading,
        padding: `${pad.y}cqw ${pad.x}cqw`,
        background: colors.bg,
        color: colors.fg,
        borderRadius: block.look === "pill" ? "999px" : `${pad.radius}cqw`,
        textAlign: block.align ?? "left",
        display: block.look === "pill" ? "inline-block" : "block",
        maxWidth: "100%",
      }}
      className="whitespace-pre-wrap break-words"
    >
      {empty ? <span className="opacity-40">{block.placeholder || "Нажмите, чтобы написать"}</span> : block.text}
    </div>
  );
}

/** Фото в рамке. Если задано кадрирование, картинка сдвинута и приближена внутри рамки. */
function PhotoImage({ block, src, alt }: { block: Extract<PageBlock, { type: "photo" }>; src: string; alt: string }) {
  const [ar, setAr] = useState(0);
  const inner = innerBox(block.frame, false, block.w, block.h);
  if (!src) return <div className="h-full w-full animate-pulse bg-[#e6ddd1]" />;
  if (block.crop && ar) {
    const g = cropGeom(inner, ar, block.crop);
    return (
      <div className="relative h-full w-full overflow-hidden">
        <img src={src} alt={alt} draggable={false} className="absolute max-w-none select-none" style={{ left: `${g.left}cqw`, top: `${g.top}cqw`, width: `${g.dw}cqw`, height: `${g.dh}cqw` }} />
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      draggable={false}
      onLoad={(event) => setAr(event.currentTarget.naturalHeight / Math.max(1, event.currentTarget.naturalWidth))}
      className="block h-full w-full select-none object-cover"
    />
  );
}

function PhotoArt({ block }: { block: Extract<PageBlock, { type: "photo" }> }) {
  const src = useMedia(block.frame === "sticker" && block.cut ? block.cut : block.src);
  const flat = block.shadow === false ? "no-shadow" : "";
  const alt = block.caption || "Фотография";
  const img = <PhotoImage block={block} src={src} alt={alt} />;
  if (block.frame === "sticker" && block.cut) {
    return src ? <img src={src} alt={alt} draggable={false} className={cn("sticker-art block h-full w-full select-none object-contain", flat)} /> : null;
  }
  if (block.frame === "sticker") {
    return <div className={cn("photo-shadow h-full w-full overflow-hidden rounded-[2.2cqw] border-[1.4cqw] border-white bg-white", flat)}>{img}</div>;
  }
  if (block.frame === "polaroid") {
    return (
      <div
        className={cn("photo-shadow flex h-full w-full flex-col bg-white", flat)}
        style={{ padding: `${(POLAROID.top * block.w) / 100}cqw ${(POLAROID.side * block.w) / 100}cqw 0` }}
      >
        <div className="min-h-0 flex-1 overflow-hidden">{img}</div>
        <div
          className="flex shrink-0 items-center justify-center overflow-hidden text-center text-[#2a2420]"
          style={{ height: `${(POLAROID.bottom * block.w) / 100}cqw`, fontFamily: FONT_FAMILY.script, fontSize: `${Math.min(5, block.w * 0.075)}cqw`, lineHeight: 1 }}
        >
          {block.caption}
        </div>
      </div>
    );
  }
  if (block.frame === "tape") {
    return (
      <div className="relative h-full w-full">
        <div className={cn("photo-shadow h-full w-full overflow-hidden rounded-[0.6cqw]", flat)}>{img}</div>
        <img src={stickerUrl("tape")} alt="" className="absolute left-1/2 top-0 w-[40%] -translate-x-1/2 -translate-y-1/2 -rotate-3" />
      </div>
    );
  }
  return <div className={cn("photo-shadow h-full w-full overflow-hidden", block.shadow === false ? "rounded-none no-shadow" : "rounded-[1.4cqw]")}>{img}</div>;
}

function SlotArt({ block }: { block: Extract<PageBlock, { type: "slot" }> }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-[1.5cqw] rounded-[2cqw] border-[0.4cqw] border-dashed border-[#c45d72]/60 bg-white/40 text-center text-[#8e3d52]">
      <ImagePlus style={{ width: "7cqw", height: "7cqw" }} strokeWidth={1.5} />
      <span style={{ fontSize: "3cqw", fontFamily: FONT_FAMILY.sans }} className="px-[2cqw] leading-tight">
        {block.label || "Фото"}
      </span>
    </div>
  );
}
