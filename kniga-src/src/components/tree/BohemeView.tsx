import { FramedFace } from "@/components/tree/FramedFace";
import { SheetTitle } from "@/components/tree/SheetTitle";
import { fitName, kinship, yearsOf } from "@/lib/tree/kinship";
import { BOHEME_FRAME, BOHEME_FRAMES, type BohemeSheet } from "@/lib/tree/boheme";
import type { Person, Union } from "@/lib/tree/types";

const INK = "#f6f1e6";

function frameOf(id: string) {
  let n = 0;
  for (const ch of id) n = (n + ch.charCodeAt(0)) % BOHEME_FRAMES.length;
  return BOHEME_FRAMES[n]!;
}

export function BohemeView({ sheet, people, unions, focusId, selectedId }: { sheet: BohemeSheet; people: Person[]; unions: Union[]; focusId: string; selectedId: string | null }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const w = sheet.width;
  const h = sheet.height;
  return (
    <div className="relative overflow-hidden" style={{ width: w, height: h, background: "#1a2418" }}>
      <img src="/tree/boheme/bg.jpg" alt="" className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover blur-lg" />
      <div className="pointer-events-none absolute inset-0 bg-[#10160e]/50" />
      <img src="/tree/boheme/sprig.png" alt="" className="pointer-events-none absolute left-0 top-0 h-[190px] w-[190px]" />
      <img src="/tree/boheme/sprig.png" alt="" className="pointer-events-none absolute right-0 top-0 h-[190px] w-[190px] -scale-x-100" />
      <img src="/tree/boheme/sprig.png" alt="" className="pointer-events-none absolute bottom-0 left-0 h-[190px] w-[190px] -scale-y-100" />
      <img src="/tree/boheme/sprig.png" alt="" className="pointer-events-none absolute bottom-0 right-0 h-[190px] w-[190px] -scale-x-100 -scale-y-100" />
      <svg className="absolute inset-0" width={w} height={h} role="img" aria-label="Богема">
        <line x1={34} y1={210} x2={34} y2={h - 210} stroke="rgba(246,241,230,0.45)" strokeWidth={1} />
        <line x1={w - 34} y1={210} x2={w - 34} y2={h - 210} stroke="rgba(246,241,230,0.45)" strokeWidth={1} />
        <g fill="none" stroke="rgba(246,241,230,0.78)" strokeWidth={1.15} strokeLinecap="round">
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
          const top = node.y + BOHEME_FRAME + 8;
          const role = kinship(people, unions, focusId, person.id).card;
          const years = yearsOf(person);
          return (
            <g key={node.id}>
              {(() => {
                const f = fitName(person, 220, 16);
                return (
                  <text x={node.x} y={top + 18} textAnchor="middle" fill={INK} fontFamily="var(--font-serif)" fontSize={f.size} textLength={f.textLength} lengthAdjust="spacingAndGlyphs">
                    {f.text}
                  </text>
                );
              })()}
              <text x={node.x} y={top + 38} textAnchor="middle" fill={INK} opacity={0.82} fontFamily="var(--font-serif)" fontSize={12}>
                {role}
              </text>
              {years && (
                <text x={node.x} y={top + 56} textAnchor="middle" fill={INK} opacity={0.72} fontFamily="var(--font-serif)" fontSize={12}>
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
        return <FramedFace key={node.id} x={node.x} y={node.y} size={BOHEME_FRAME} hole={frame.hole} frame={frame.src} photo={person.photo} ring={node.id === selectedId || node.id === focusId ? INK : undefined} />;
      })}
    </div>
  );
}
