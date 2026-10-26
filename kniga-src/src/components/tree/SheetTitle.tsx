import { useState } from "react";
import { useTree } from "@/lib/tree/ui-store";

export function SheetTitle({ top, color, fallback }: { top: number; color: string; fallback: string }) {
  const banner = useTree((s) => s.banner);
  const setBanner = useTree((s) => s.setBanner);
  const [editing, setEditing] = useState(false);
  const shown = banner.trim() || fallback;
  return (
    <input
      aria-label="Надпись на листе"
      value={editing ? banner : shown}
      placeholder={fallback}
      onFocus={() => {
        setEditing(true);
        if (!banner.trim()) setBanner(fallback);
      }}
      onChange={(e) => setBanner(e.target.value.slice(0, 32))}
      onBlur={() => setEditing(false)}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute left-1/2 z-10 w-[min(640px,80%)] -translate-x-1/2 bg-transparent text-center font-serif text-[34px] leading-none outline-none"
      style={{ top, color }}
    />
  );
}
