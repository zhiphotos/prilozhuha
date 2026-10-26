import { FramedFace } from "@/components/tree/FramedFace";
import { SheetTitle } from "@/components/tree/SheetTitle";
import { displayName, kinship, yearsOf } from "@/lib/tree/kinship";
import { FRAME, FRAMES, type CameoSheet } from "@/lib/tree/cameo";
import type { Person, Union } from "@/lib/tree/types";

const INK = "#f4efe4";

function frameOf(id: string) {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % FRAMES.length;
  return FRAMES[n]!;
}

export function CameoView({ sheet, people, unions, focusId, selectedId }: { sheet: CameoSheet; people: Person[]; unions: Union[]; focusId: string; selectedId: string | null }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  return (
    <div className="relative" style={{ width: sheet.width, height: sheet.height, background: "#000" }}>
      <svg className="absolute inset-0" width={sheet.width} height={sheet.height} role="img" aria-label="Камея">
        <g fill="none" stroke={INK} strokeWidth={1.15} strokeLinecap="round" opacity={0.8}>
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
          const top = node.y + FRAME + 6;
          const role = kinship(people, unions, focusId, person.id).card;
          const years = yearsOf(person);
          return (
            <g key={node.id}>
              <text x={node.x} y={top + 18} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={16}>
                {displayName(person)}
              </text>
              <text x={node.x} y={top + 36} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={12}>
                {role}
              </text>
              {years && (
                <text x={node.x} y={top + 54} textAnchor="middle" fill={INK} opacity={0.72} fontFamily="var(--font-serif)" fontSize={12}>
                  {years}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <SheetTitle top={16} color={INK} fallback={sheet.title} />
      {sheet.nodes.map((node) => {
        const person = byId.get(node.id);
        if (!person) return null;
        const frame = frameOf(person.id);
        return <FramedFace key={node.id} x={node.x} y={node.y} size={FRAME} hole={frame.hole} frame={frame.src} photo={person.photo} ring={node.id === selectedId || node.id === focusId ? "#e0b56a" : undefined} />;
      })}
    </div>
  );
}
