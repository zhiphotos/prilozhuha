import { FramedFace } from "@/components/tree/FramedFace";
import { cardLine } from "@/lib/tree/card-fields";
import { SheetTitle } from "@/components/tree/SheetTitle";
import { useMemo } from "react";
import { fitText, initialsOf, nameLines, yearsOf } from "@/lib/tree/kinship";
import { relationCard, relationsFrom } from "@/lib/tree/recenter";
import { FRAME, FRAMES, type CameoSheet } from "@/lib/tree/cameo";
import type { Person, Union } from "@/lib/tree/types";

const INK = "#f4efe4";

function frameOf(id: string) {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % FRAMES.length;
  return FRAMES[n]!;
}

export function CameoView({ sheet, people, unions, focusId, homeId, selectedId, marked }: { sheet: CameoSheet; people: Person[]; unions: Union[]; focusId: string; homeId?: string; selectedId: string | null; marked?: ReadonlySet<string> }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const rels = useMemo(() => relationsFrom(people, unions, focusId, homeId), [people, unions, focusId, homeId]);
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
          const rel = rels.get(person.id);
          const role = rel ? relationCard(rel) : "";
          const years = cardLine(person, yearsOf(person));
          return (
            <g key={node.id}>
              {(() => {
                const lines = nameLines(person);
                const a = fitText(lines.top, 210, 16);
                const b = lines.bottom ? fitText(lines.bottom, 210, 13, 9) : null;
                return (
                  <>
                    <text x={node.x} y={top + 18} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={a.size} textLength={a.textLength} lengthAdjust="spacingAndGlyphs">
                      {a.text}
                    </text>
                    {b ? (
                      <text x={node.x} y={top + 33} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" opacity={0.9} fontSize={b.size} textLength={b.textLength} lengthAdjust="spacingAndGlyphs">
                        {b.text}
                      </text>
                    ) : null}
                  </>
                );
              })()}
              <text x={node.x} y={top + 49} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={12}>
                {role}
              </text>
              {years && (
                <text x={node.x} y={top + 67} textAnchor="middle" fill={INK} opacity={0.72} fontFamily="var(--font-serif)" fontSize={12}>
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
        return <FramedFace key={node.id} x={node.x} y={node.y} size={FRAME} hole={frame.hole} frame={frame.src} photo={person.photo} initials={initialsOf(person)} ring={node.id === selectedId || node.id === focusId || marked?.has(node.id) ? "#e0b56a" : undefined} />;
      })}
    </div>
  );
}
