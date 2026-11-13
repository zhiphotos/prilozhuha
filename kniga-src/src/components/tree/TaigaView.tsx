import { FramedFace } from "@/components/tree/FramedFace";
import { cardLine } from "@/lib/tree/card-fields";
import { SheetTitle } from "@/components/tree/SheetTitle";
import { useMemo } from "react";
import { fitText, initialsOf, nameLines, yearsOf } from "@/lib/tree/kinship";
import { relationCard, relationsFrom } from "@/lib/tree/recenter";
import { TAIGA_FRAME, TAIGA_FRAMES, type TaigaSheet } from "@/lib/tree/taiga";
import type { Person, Union } from "@/lib/tree/types";

const INK = "#f4f7f2";

function frameOf(id: string) {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % TAIGA_FRAMES.length;
  return TAIGA_FRAMES[n]!;
}

export function TaigaView({ sheet, people, unions, focusId, homeId, selectedId, marked }: { sheet: TaigaSheet; people: Person[]; unions: Union[]; focusId: string; homeId?: string; selectedId: string | null; marked?: ReadonlySet<string> }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const rels = useMemo(() => relationsFrom(people, unions, focusId, homeId), [people, unions, focusId, homeId]);
  return (
    <div className="relative overflow-hidden" style={{ width: sheet.width, height: sheet.height, background: "#142018" }}>
      <img src="./tree/taiga/bg.jpg" alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-cover blur-[2px]" />
      <div className="pointer-events-none absolute inset-0 bg-[#0e1612]/35" />
      <svg className="absolute inset-0" width={sheet.width} height={sheet.height} role="img" aria-label="Тайга">
        <g fill="none" stroke="rgba(244,247,242,0.8)" strokeWidth={1.15} strokeLinecap="round">
          {sheet.vines.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {sheet.marks.map((mark, i) => (
          <text key={i} x={mark.x} y={mark.y} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={12} fontStyle="italic">
            {mark.text}
          </text>
        ))}
        {sheet.nodes.map((node) => {
          const person = byId.get(node.id);
          if (!person) return null;
          const rel = rels.get(person.id);
          const role = rel ? relationCard(rel) : "";
          const years = cardLine(person, yearsOf(person));
          const top = node.y + TAIGA_FRAME + 4;
          return (
            <g key={node.id}>
              {(() => {
                const lines = nameLines(person);
                const a = fitText(lines.top, 210, 15);
                const b = lines.bottom ? fitText(lines.bottom, 210, 12, 9) : null;
                return (
                  <>
                    <text x={node.x} y={top + 16} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={a.size} textLength={a.textLength} lengthAdjust="spacingAndGlyphs">
                      {a.text}
                    </text>
                    {b ? (
                      <text x={node.x} y={top + 31} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" opacity={0.9} fontSize={b.size} textLength={b.textLength} lengthAdjust="spacingAndGlyphs">
                        {b.text}
                      </text>
                    ) : null}
                  </>
                );
              })()}
              <text x={node.x} y={top + 46} textAnchor="middle" fill={INK} opacity={0.86} fontFamily="var(--font-serif)" fontSize={11}>
                {role}
              </text>
              {years && (
                <text x={node.x} y={top + 62} textAnchor="middle" fill={INK} opacity={0.72} fontFamily="var(--font-serif)" fontSize={11}>
                  {years}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <SheetTitle top={18} color={INK} fallback={sheet.title} />
      {sheet.nodes.map((node) => {
        const person = byId.get(node.id);
        if (!person) return null;
        const frame = frameOf(person.id);
        return <FramedFace key={node.id} x={node.x} y={node.y} size={TAIGA_FRAME} hole={frame.hole} frame={frame.src} photo={person.photo} initials={initialsOf(person)} ring={node.id === selectedId || node.id === focusId || marked?.has(node.id) ? INK : undefined} />;
      })}
    </div>
  );
}
