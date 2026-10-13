import { useState } from "react";
import { AUDIENCES } from "@/lib/rod/content";
import type { Audience } from "@/lib/rod/types";
import { useRod } from "@/lib/rod/store";
import { Button, Field } from "@/components/rod/chrome";
import { Cut, packBg } from "@/components/rod/botanica";
import { cn } from "@/lib/cn";

export function Onboarding({ ready = true }: { ready?: boolean }) {
  const finish = useRod((state) => state.finishOnboarding);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [dedicatee, setDedicatee] = useState("");
  const [collector, setCollector] = useState("");
  const named = audience === "children" || audience === "future";

  return (
    <main className="min-h-dvh">
      <header className="forest rounded-none px-6 pb-14 pt-[max(2.5rem,env(safe-area-inset-top))]" style={{ ["--forest-img" as string]: packBg("bg_8154") }}>
        <div className="mx-auto max-w-xl">
          <p className="hand text-[2.4rem] leading-none text-[#c9ae74]">Книга рода</p>
          <h1 className="display-title mt-4 max-w-[12ch] text-[2.8rem] leading-[1.02] text-paper sm:max-w-none sm:text-6xl">Для кого я это собираю?</h1>
          <p className="mt-3 max-w-[32ch] text-paper/75">Не ради дерева. Страница нужна человеку, который однажды её откроет.</p>
        </div>
        <Cut id="moth" className="pointer-events-none absolute -right-8 top-8 w-44 rotate-[14deg] opacity-90" />
      </header>
      <div className="relative z-10 mx-auto -mt-6 w-full max-w-xl rounded-t-2xl bg-paper px-5 pb-10 pt-6 shadow-[var(--shadow-soft)] sm:rounded-2xl sm:px-8">
        <div className="mt-6 grid gap-2">
          {AUDIENCES.map((item) => {
            const active = audience === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAudience(item.id)}
                className={cn(
                  "flex min-h-16 items-start gap-3 rounded-xl border px-4 py-3 text-left",
                  active ? "border-moss bg-sage-soft" : "border-line bg-white/50",
                )}
              >
                <span
                  className={cn(
                    "mt-1 grid size-5 shrink-0 place-items-center rounded-full border",
                    active ? "border-moss bg-moss" : "border-muted",
                  )}
                  aria-hidden
                >
                  {active ? <span className="size-2 rounded-full bg-paper" /> : null}
                </span>
                <span>
                  <span className="block font-semibold text-ink">{item.title}</span>
                  <span className="block text-sm text-muted">{item.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 grid gap-4">
          {named ? (
            <Field label="Как его зовут?" hint="Можно пока не знать — поле не обязательное.">
              <input
                className="field"
                value={dedicatee}
                onChange={(event) => setDedicatee(event.target.value)}
                placeholder="Например, Марк"
              />
            </Field>
          ) : null}
          <Field label="Ваше имя на обложке" hint="Можно пропустить.">
            <input
              className="field"
              value={collector}
              onChange={(event) => setCollector(event.target.value)}
              placeholder="Как вас представлять в книге"
            />
          </Field>
        </div>
        <Button className="mt-6 w-full" disabled={!ready || !audience} onClick={() => audience && finish({ audience, dedicatee, collector })}>
          Начать собирать
        </Button>
      </div>
    </main>
  );
}
