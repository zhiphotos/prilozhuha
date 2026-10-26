import { FramedFace } from "@/components/tree/FramedFace";
import { SheetTitle } from "@/components/tree/SheetTitle";
import { displayName, kinship, yearsOf } from "@/lib/tree/kinship";
import { GZHEL_FRAME, GZHEL_FRAMES, type GzhelSheet } from "@/lib/tree/gzhel";
import type { Person, Union } from "@/lib/tree/types";

const INK = "#1c4f97";

function frameOf(id: string) {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % GZHEL_FRAMES.length;
  return GZHEL_FRAMES[n]!;
}

export function GzhelView({ sheet, people, unions, focusId, selectedId }: { sheet: GzhelSheet; people: Person[]; unions: Union[]; focusId: string; selectedId: string | null }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <div className="relative" style={{ width: sheet.width, height: sheet.height, background: "#fbfcfe" }}>
      <svg className="absolute inset-0" width={sheet.width} height={sheet.height} role="img" aria-label="Гжель">
        <rect x={28} y={28} width={sheet.width - 56} height={sheet.height - 56} fill="none" stroke="#2a6fbe" strokeWidth={1.4} />
        <rect x={36} y={36} width={sheet.width - 72} height={sheet.height - 72} fill="none" stroke="#7eaddd" strokeWidth={0.8} />
        <g fill="none" stroke="#2a6fbe" strokeWidth={1.7} strokeLinecap="round">
          {sheet.vines.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {sheet.marks.map((mark, i) => (
          <text key={i} x={mark.x} y={mark.y} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={13} fontStyle="italic">
            {mark.text}
          </text>
        ))}
        {sheet.nodes.map((node) => {
          const person = byId.get(node.id);
          if (!person) return null;
          const top = node.y + GZHEL_FRAME + 6;
          const role = kinship(people, unions, focusId, person.id).card;
          const years = yearsOf(person);
          return (
            <g key={node.id}>
              <text x={node.x} y={top + 18} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={16}>
                {displayName(person)}
              </text>
              <text x={node.x} y={top + 36} textAnchor="middle" fill="#3d6eae" fontFamily="var(--font-serif)" fontSize={12}>
                {role}
              </text>
              {years && (
                <text x={node.x} y={top + 54} textAnchor="middle" fill="#3d6eae" fontFamily="var(--font-serif)" fontSize={12}>
                  {years}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <SheetTitle top={14} color={INK} fallback={sheet.title} />
      <img src="/tree/gzhel/frame-2.png" alt="" className="pointer-events-none absolute" style={{ left: 16, top: 16, width: 92, height: 92 }} />
      <img src="/tree/gzhel/frame-4.png" alt="" className="pointer-events-none absolute" style={{ right: 16, top: 16, width: 92, height: 92 }} />
      <img src="/tree/gzhel/frame-5.png" alt="" className="pointer-events-none absolute" style={{ left: 16, bottom: 16, width: 92, height: 92 }} />
      <img src="/tree/gzhel/frame-1.png" alt="" className="pointer-events-none absolute" style={{ right: 16, bottom: 16, width: 92, height: 92 }} />
      {sheet.nodes.map((node) => {
        const person = byId.get(node.id);
        if (!person) return null;
        const frame = frameOf(person.id);
        return <FramedFace key={node.id} x={node.x} y={node.y} size={GZHEL_FRAME} hole={frame.hole} frame={frame.src} photo={person.photo} ring={node.id === selectedId || node.id === focusId ? "#1c4f97" : undefined} />;
      })}
    </div>
  );
}
