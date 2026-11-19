// Этап 4.4: то, что семейная раскладка добавляет к листам тем: далёкие связи пунктиром, карточки-ссылки, подписи групп. Цвета и шрифт приходят от темы.
import { initialsOf } from "@/lib/tree/kinship";
import type { FamilyExtras } from "@/lib/tree/family-sheet";
import type { Person } from "@/lib/tree/types";

export function FamilyOverlay({ sheet, byId, ink, stroke, strokeWidth, frame }: { sheet: Partial<FamilyExtras>; byId: Map<string, Person>; ink: string; stroke: string; strokeWidth: number; frame: number }) {
  return (
    <>
      <g fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeDasharray="2 8" opacity={0.85}>
        {sheet.far?.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {sheet.refs?.map((r) => {
        const person = byId.get(r.of);
        const name = person ? [person.firstName, person.lastName].filter(Boolean).join(" ") : "";
        return (
          <g key={r.id}>
            <title>Это ссылка на человека, который стоит в другом месте дерева: нажмите, чтобы перейти.</title>
            <circle cx={r.x} cy={r.y} r={frame * 0.62} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray="5 6" />
            <text x={r.x} y={r.y + 5} textAnchor="middle" fill={ink} fontFamily="var(--font-serif)" fontSize={15}>{person ? `↗ ${initialsOf(person)}` : "↗"}</text>
            <text x={r.x} y={r.y + frame + 24} textAnchor="middle" fill={ink} fontFamily="var(--font-serif)" fontStyle="italic" fontSize={13}>{name}</text>
          </g>
        );
      })}
      {sheet.groups?.map((g) => (
        <g key={g.kind} pointerEvents="none">
          <text x={g.x} y={g.y - 14} fill={ink} fontFamily="var(--font-serif)" fontSize={26} fontWeight={600}>{g.text}</text>
          <text x={g.x} y={g.y + 12} fill={ink} fontFamily="var(--font-serif)" fontStyle="italic" opacity={0.8} fontSize={15}>{g.sub}</text>
        </g>
      ))}
    </>
  );
}
