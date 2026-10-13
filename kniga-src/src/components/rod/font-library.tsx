import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/rod/chrome";
import { FONT_LIBRARY, ensureLibraryFont } from "@/lib/rod/fonts";
import type { FontRef } from "@/lib/rod/types";
import { cn } from "@/lib/cn";

const GROUPS = ["Рукописные", "Заголовочные", "С засечками"] as const;
const SAMPLE = "Бабушка Нина, 1948";

/** Окно «Шрифты»: все шрифты библиотеки на одной фразе, нажали – шрифт встал на выбранный текст. */
export function FontLibrarySheet({ value, sample, onPick, onClose }: { value: FontRef; sample?: string; onPick: (font: FontRef) => void; onClose: () => void }) {
  const phrase = sample?.trim() ? sample.trim().replace(/\s+/g, " ").slice(0, 60) : SAMPLE;
  const [ready, setReady] = useState<Record<string, boolean>>({});
  // Шрифты подгружаются, когда окно открыто: до этого они не качаются.
  useEffect(() => {
    FONT_LIBRARY.forEach((font) => void ensureLibraryFont(font.id).then(() => setReady((state) => ({ ...state, [font.id]: true }))));
  }, []);
  return (
    <Sheet title="Шрифты" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">Нажмите на надпись, и шрифт встанет на выбранный текст. Менять его можно в любой момент.</p>
      {GROUPS.map((group) => (
        <section key={group} className="mb-4">
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">{group}</h3>
          <ul>
            {FONT_LIBRARY.filter((font) => font.group === group).map((font) => {
              const ref = `custom:${font.id}` as FontRef;
              const active = value === ref;
              return (
                <li key={font.id} className="border-b border-ink/10">
                  <button
                    type="button"
                    onClick={() => {
                      void ensureLibraryFont(font.id).then(() => {
                        onPick(ref);
                        onClose();
                      });
                    }}
                    className="flex min-h-16 w-full items-center gap-3 py-2 text-left active:bg-ink/5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={cn("block break-words text-[1.6rem] leading-[1.15] text-ink", !ready[font.id] && "invisible")} style={{ fontFamily: `"kr-${font.id}", "Manrope Variable", sans-serif`, fontWeight: 400 }}>
                        {phrase}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{font.name}</span>
                    </span>
                    {active ? <Check className="size-4 shrink-0 text-moss" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
