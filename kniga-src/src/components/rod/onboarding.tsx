import { useState } from "react";
import { AUDIENCES } from "@/lib/rod/content";
import type { Audience } from "@/lib/rod/types";
import { useRod } from "@/lib/rod/store";
import { Button, Field } from "@/components/rod/chrome";
import { cn } from "@/lib/cn";

export function Onboarding({ ready = true }: { ready?: boolean }) {
  const finish = useRod((state) => state.finishOnboarding);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [dedicatee, setDedicatee] = useState("");
  const [collector, setCollector] = useState("");
  const named = audience === "children" || audience === "future";

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="glass w-full max-w-xl rounded-4xl p-6 sm:p-8">
        <p className="text-sm text-rose-deep">Книга рода</p>
        <h1 className="mt-2 font-display text-4xl leading-tight text-ink sm:text-5xl">Для кого я это собираю?</h1>
        <p className="mt-3 max-w-md text-muted">
          Не ради дерева. Страница нужна человеку, который однажды её откроет.
        </p>
        <div className="mt-6 grid gap-2">
          {AUDIENCES.map((item) => {
            const active = audience === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setAudience(item.id)}
                className={cn(
                  "flex min-h-16 items-start gap-3 rounded-3xl border px-4 py-3 text-left",
                  active ? "border-rose bg-blush/70" : "border-line bg-paper/60",
                )}
              >
                <span
                  className={cn(
                    "mt-1 grid size-5 shrink-0 place-items-center rounded-full border",
                    active ? "border-rose bg-rose" : "border-muted",
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
