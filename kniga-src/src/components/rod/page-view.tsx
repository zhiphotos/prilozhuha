import type { CSSProperties, ReactNode } from "react";
import { ImagePlus } from "lucide-react";
import { useMedia } from "@/lib/rod/media";
import {
  COLORS,
  FONT_FAMILY,
  FONT_WEIGHT,
  PAGE_RATIO,
  POLAROID,
  lookColors,
  lookPad,
  stickerRatio,
  stickerUrl,
  textMetrics,
} from "@/lib/rod/page-style";
import type { BookPage, InkStroke, PageBlock, PaperKind } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

export type CoverMeta = { dedicatee: string; collector: string };

/** Высота страницы в единицах ширины (для координат по вертикали). */
export const PAGE_H = 100 * PAGE_RATIO;

export function inkColor(color: InkStroke["color"]): string {
  if (color === "rose") return COLORS.rose;
  if (color === "sage") return COLORS.sage;
  if (color === "gold") return "#d9a441";
  if (color === "white") return "#ffffff";
  return COLORS.ink;
}

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
}: {
  page: BookPage;
  meta: CoverMeta;
  className?: string;
  children?: ReactNode;
  editing?: boolean;
  hideStrokes?: boolean;
  clip?: boolean;
}) {
  return (
    <div
      className={cn("page-sheet relative w-full", clip && "overflow-hidden", className)}
      style={{ ...paperStyle(page.paper), aspectRatio: `1 / ${PAGE_RATIO}`, containerType: "inline-size" }}
    >
      <div className="paper-grain pointer-events-none absolute inset-0" />
      {page.kind === "cover" ? <CoverArt meta={meta} /> : null}
      {children ?? (
        <>
          {page.blocks.map((block) => (
            <PlacedBlock key={block.id} block={block}>
              <BlockArt block={block} editing={editing} />
            </PlacedBlock>
          ))}
        </>
      )}
      {hideStrokes ? null : <InkLayer strokes={page.strokes} />}
    </div>
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

export function InkLayer({ strokes, live }: { strokes: InkStroke[]; live?: InkStroke | null }) {
  return (
    <svg viewBox={`0 0 100 ${PAGE_H}`} className="pointer-events-none absolute inset-0 z-30 h-full w-full">
      {[...strokes, ...(live ? [live] : [])].map((stroke) => (
        <polyline
          key={stroke.id}
          fill="none"
          stroke={inkColor(stroke.color)}
          strokeOpacity={stroke.alpha ?? 1}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={toPoints(stroke.points)}
        />
      ))}
    </svg>
  );
}

function toPoints(points: number[]) {
  const pairs: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) pairs.push(`${points[i]},${(points[i + 1] * PAGE_H) / 100}`);
  return pairs.join(" ");
}

export function boxOf(block: PageBlock): { x: number; y: number; w: number; h: number | null; rotate: number } {
  const rotate = block.rotate ?? 0;
  if (block.type === "photo" || block.type === "slot") return { x: block.x, y: block.y, w: block.w, h: block.h, rotate };
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
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Как блок выглядит. Без рамок выбора — их рисует редактор. */
export function BlockArt({ block, editing = false }: { block: PageBlock; editing?: boolean }) {
  if (block.type === "text") return <TextArt block={block} editing={editing} />;
  if (block.type === "photo") return <PhotoArt block={block} />;
  if (block.type === "sticker") return <img src={stickerUrl(block.kind)} alt="" draggable={false} className="sticker-art block w-full select-none" style={{ aspectRatio: `1 / ${stickerRatio(block.kind)}` }} />;
  if (block.type === "slot") return editing ? <SlotArt block={block} /> : null;
  return null;
}

export function TextArt({ block, editing }: { block: Extract<PageBlock, { type: "text" }>; editing: boolean }) {
  const metrics = textMetrics(block.font, block.size);
  const pad = lookPad(block.look);
  const colors = lookColors(block.look);
  const empty = !block.text.trim();
  if (empty && !editing) return null;
  return (
    <div
      style={{
        fontFamily: FONT_FAMILY[block.font],
        fontWeight: FONT_WEIGHT[block.font],
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

function PhotoArt({ block }: { block: Extract<PageBlock, { type: "photo" }> }) {
  const src = useMedia(block.frame === "sticker" && block.cut ? block.cut : block.src);
  const img = src ? <img src={src} alt={block.caption || "Фотография"} draggable={false} className="block h-full w-full select-none object-cover" /> : <div className="h-full w-full animate-pulse bg-[#e6ddd1]" />;
  if (block.frame === "sticker" && block.cut) {
    return src ? <img src={src} alt={block.caption || "Фотография"} draggable={false} className="sticker-art block h-full w-full select-none object-contain" /> : null;
  }
  if (block.frame === "sticker") {
    return <div className="photo-shadow h-full w-full overflow-hidden rounded-[2.2cqw] border-[1.4cqw] border-white bg-white">{img}</div>;
  }
  if (block.frame === "polaroid") {
    return (
      <div
        className="photo-shadow flex h-full w-full flex-col bg-white"
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
        <div className="photo-shadow h-full w-full overflow-hidden rounded-[0.6cqw]">{img}</div>
        <img src={stickerUrl("tape")} alt="" className="absolute left-1/2 top-0 w-[40%] -translate-x-1/2 -translate-y-1/2 -rotate-3" />
      </div>
    );
  }
  return <div className="photo-shadow h-full w-full overflow-hidden rounded-[1.4cqw]">{img}</div>;
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
