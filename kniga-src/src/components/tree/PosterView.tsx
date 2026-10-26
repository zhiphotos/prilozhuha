import { displayName, kinship, yearsOf } from "@/lib/tree/kinship";
import type { PosterSheet } from "@/lib/tree/poster";
import type { Person, Union } from "@/lib/tree/types";

export function PosterView({ poster, people, unions, focusId, selectedId }: { poster: PosterSheet; people: Person[]; unions: Union[]; focusId: string; selectedId: string | null }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const { cardH } = poster;
  return (
    <div
      className="relative"
      style={{
        width: poster.width,
        height: poster.height,
        backgroundColor: "#f7f6f3",
        backgroundImage: "url(/tree/oak-white.jpg?v=5)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <svg className="absolute inset-0" width={poster.width} height={poster.height} aria-hidden>
        <g fill="none" stroke="rgba(55,48,40,0.38)" strokeWidth={1.15}>
          {poster.links.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        {poster.rings.map((ring, i) => (
          <g key={i} transform={`translate(${ring.x} ${ring.y})`} fill="rgba(255,255,255,0.72)" stroke="rgba(55,48,40,0.55)" strokeWidth={1}>
            <circle cx={-5.5} cy={0} r={5.5} />
            <circle cx={5.5} cy={0} r={5.5} />
          </g>
        ))}
      </svg>
      <div className="glass-plaque pointer-events-none absolute flex items-center justify-center px-4" style={{ left: poster.titleX - 86, top: poster.titleY - 16, width: 172, height: 32 }}>
        <span className="text-[11px] font-medium tracking-[0.22em] text-neutral-800">{poster.title}</span>
      </div>
      {poster.nodes.map((node) => {
        const person = byId.get(node.id);
        if (!person) return null;
        const on = node.id === selectedId || node.id === focusId;
        const years = yearsOf(person);
        const role = kinship(people, unions, focusId, person.id).card;
        const w = node.w;
        return (
          <div
            key={node.id}
            className={`glass-plaque absolute flex items-center gap-2 px-1.5 ${on ? "glass-plaque-on" : ""}`}
            style={{ left: node.x - w / 2, top: node.y - cardH / 2, width: w, height: cardH }}
          >
            {person.photo ? <img src={person.photo} alt="" className={w < 150 ? "glass-photo is-tiny" : "glass-photo"} /> : <span className={`grid place-items-center text-sm text-neutral-500 ${w < 150 ? "glass-photo is-tiny" : "glass-photo"}`}>{(person.firstName[0] ?? "").toUpperCase()}</span>}
            <span className="min-w-0 flex-1">
              <span className="block whitespace-nowrap text-[13px] font-medium leading-tight tracking-tight text-neutral-900">{displayName(person)}</span>
              {years && <span className="mt-0.5 block whitespace-nowrap text-[11px] text-neutral-500">({years})</span>}
              <span className="mt-0.5 block whitespace-nowrap text-[11px] text-neutral-500">{role}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
