import { useMemo } from "react";
import { createPortal } from "react-dom";
import { BohemeView } from "@/components/tree/BohemeView";
import { CameoView } from "@/components/tree/CameoView";
import { GzhelView } from "@/components/tree/GzhelView";
import { PosterView } from "@/components/tree/PosterView";
import { TaigaView } from "@/components/tree/TaigaView";
import { layoutBoheme } from "@/lib/tree/boheme.ts";
import { layoutCameo } from "@/lib/tree/cameo.ts";
import { layoutGzhel } from "@/lib/tree/gzhel.ts";
import { layoutTree } from "@/lib/tree/layout.ts";
import { layoutPoster } from "@/lib/tree/poster.ts";
import { layoutTaiga } from "@/lib/tree/taiga.ts";
import type { TreeStyle } from "@/lib/tree/styles.ts";
import type { TreeData } from "@/lib/tree/types.ts";
import { kinship } from "@/lib/tree/kinship.ts";

/**
 * Печать древа в PDF. Рисуем тот же векторный лист, что на экране (SVG/DOM, без растрового холста),
 * в размере самого древа. Сохранение в PDF делает браузер: «Печать» → «Сохранить как PDF».
 */
export function PrintTree({ style, data, flow, onClose }: { style: TreeStyle; data: TreeData; flow: "down" | "up"; onClose: () => void }) {
  const sheet = useMemo(() => {
    const { people, unions, focusId } = data;
    if (style === "carved") {
      const p = layoutPoster(people, unions, focusId, flow);
      return { w: p.width, h: p.height, node: <PosterView poster={p} people={people} unions={unions} focusId={focusId} selectedId={null} /> };
    }
    if (style === "cameo") {
      const s = layoutCameo(people, unions, focusId, flow);
      return { w: s.width, h: s.height, node: <CameoView sheet={s} people={people} unions={unions} focusId={focusId} selectedId={null} /> };
    }
    if (style === "gzhel") {
      const s = layoutGzhel(people, unions, focusId, flow);
      return { w: s.width, h: s.height, node: <GzhelView sheet={s} people={people} unions={unions} focusId={focusId} selectedId={null} /> };
    }
    if (style === "boheme") {
      const s = layoutBoheme(people, unions, focusId, flow);
      return { w: s.width, h: s.height, node: <BohemeView sheet={s} people={people} unions={unions} focusId={focusId} selectedId={null} /> };
    }
    if (style === "taiga") {
      const s = layoutTaiga(people, unions, focusId, flow);
      return { w: s.width, h: s.height, node: <TaigaView sheet={s} people={people} unions={unions} focusId={focusId} selectedId={null} /> };
    }
    const l = layoutTree(people, unions, focusId, flow);
    return { w: l.width, h: l.height, node: <SchemaSvg data={data} layout={l} /> };
  }, [style, data, flow]);

  const w = Math.ceil(sheet.w);
  const h = Math.ceil(sheet.h);
  const fit = Math.min(1, (window.innerWidth - 24) / w);

  return createPortal(
    <div className="tree-print-layer fixed inset-0 z-[90] overflow-auto bg-neutral-700 p-3">
      <style>{`
        @page { size: ${w}px ${h}px; margin: 0; }
        @media print {
          body > *:not(.tree-print-layer) { display: none !important; }
          .tree-print-layer { position: absolute !important; inset: 0 !important; overflow: visible !important; background: #fff !important; padding: 0 !important; }
          .tree-print-bar { display: none !important; }
          .tree-print-inner { transform: none !important; }
        }
      `}</style>
      <div className="tree-print-bar mb-3 flex items-center justify-between gap-2 text-white">
        <span className="text-sm">Древо: {w} × {h} px. Нажмите «Печать», затем выберите «Сохранить как PDF».</span>
        <span className="flex gap-2">
          <button type="button" className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black" onClick={() => window.print()}>Печать / PDF</button>
          <button type="button" className="rounded-full border border-white/50 px-4 py-2 text-sm text-white" onClick={onClose}>Закрыть</button>
        </span>
      </div>
      <div className="tree-print-inner origin-top-left bg-white" style={{ width: w, height: h, transform: `scale(${fit})`, transformOrigin: "0 0" }}>
        {sheet.node}
      </div>
    </div>,
    document.body,
  );
}

function SchemaSvg({ data, layout }: { data: TreeData; layout: ReturnType<typeof layoutTree> }) {
  const byId = new Map(data.people.map((p) => [p.id, p]));
  return (
    <svg width={layout.width} height={layout.height} xmlns="http://www.w3.org/2000/svg">
      <rect width={layout.width} height={layout.height} fill="#fbf7f0" />
      <g fill="none" stroke="#1e4f8f" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        {layout.buses.map((bus) => {
          const min = bus.xs[0];
          const max = bus.xs[bus.xs.length - 1];
          const parts: string[] = [];
          if (bus.fromX != null && bus.fromY != null && min != null && max != null) {
            parts.push(`M ${bus.fromX} ${bus.fromY} V ${bus.busY}`);
            if (bus.fromX < min - 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${min}`);
            else if (bus.fromX > max + 1) parts.push(`M ${bus.fromX} ${bus.busY} H ${max}`);
          }
          if (min != null && max != null && bus.xs.length > 1) parts.push(`M ${min} ${bus.busY} H ${max}`);
          for (const x of bus.xs) parts.push(`M ${x} ${bus.busY} V ${bus.childTop}`);
          return <path key={bus.unionId} d={parts.join(" ")} />;
        })}
      </g>
      {layout.labels.map((label) => (
        <text key={label.gen} x={18} y={label.y} fill="#7d7368" fontFamily="Manrope, sans-serif" fontSize={13} fontWeight={600} dominantBaseline="middle">
          {label.text}
        </text>
      ))}
      <g fill="none" strokeWidth={2.4} strokeLinecap="round">
        {layout.spouses.map((link) => {
          const dir = Math.sign(link.x2 - link.x1) || 1;
          const x1 = link.x1 + dir * 48;
          const x2 = link.x2 - dir * 48;
          const color = link.status === "divorced" ? "#8a6230" : link.status === "partner" ? "#e0b56a" : "#9d3a5c";
          const d = link.curved
            ? `M ${x1} ${link.y1} Q ${(link.x1 + link.x2) / 2} ${Math.min(link.y1, link.y2) - 58} ${x2} ${link.y2}`
            : `M ${x1} ${link.y1} H ${x2}`;
          return <path key={link.unionId} d={d} stroke={color} strokeDasharray={link.status === "divorced" ? "6 7" : undefined} />;
        })}
      </g>
      {layout.spouses.map((link) => {
        const text = link.status === "divorced" ? "РАЗВОД" : link.status === "widowed" ? "ВДОВСТВО" : link.status === "partner" ? "СОЮЗ" : "БРАК";
        const color = link.status === "divorced" ? "#8a6230" : link.status === "partner" ? "#e0b56a" : "#9d3a5c";
        const px = (link.x1 + link.x2) / 2;
        const py = link.curved ? 0.25 * link.y1 + 0.5 * (Math.min(link.y1, link.y2) - 58) + 0.25 * link.y2 : link.y1;
        const w = text.length > 7 ? 112 : text.length > 4 ? 88 : 72;
        return (
          <g key={`pill-${link.unionId}`} transform={`translate(${px} ${py})`}>
            <rect x={-w / 2} y={-12} width={w} height={24} rx={12} fill="#fffaf2" stroke={color} />
            <text y={1} textAnchor="middle" dominantBaseline="middle" fill={color} fontFamily="Manrope, sans-serif" fontSize={10} fontWeight={700}>
              {text}
            </text>
          </g>
        );
      })}
      {layout.nodes.map((node) => {
        const person = byId.get(node.id);
        if (!person) return null;
        const name = [person.firstName, person.patronymic, person.lastName].filter(Boolean).join(" ");
        const role = kinship(data.people, data.unions, data.focusId, person.id).card;
        return (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={46} fill="#d7c3a4" />
            <rect x={node.x - 84} y={node.y + 46 + 12} width={168} height={72} rx={14} fill="#f6f1e7" />
            <text x={node.x} y={node.y + 46 + 12 + 22} textAnchor="middle" fill="#1c1612" fontFamily="Cormorant Garamond, serif" fontSize={16} fontWeight={600}>
              {name}
            </text>
            <text x={node.x} y={node.y + 46 + 12 + 40} textAnchor="middle" fill="#8d4e3a" fontFamily="Manrope, sans-serif" fontSize={11} fontWeight={700}>
              {role}
            </text>
            <text x={node.x} y={node.y + 46 + 12 + 58} textAnchor="middle" fill="#7d7368" fontFamily="Manrope, sans-serif" fontSize={11}>
              {[person.birthYear, person.deathYear].filter(Boolean).join(" – ")}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
