import { useState } from "react";
import { REGIONS } from "@/lib/rod/content";
import { explainSurname, type SurnameReading } from "@/lib/rod/surname";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

export function SurnameScreen() {
  const nav = useNav();
  const [surname, setSurname] = useState("");
  const [region, setRegion] = useState("");
  const [known, setKnown] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<SurnameReading | null>(null);

  return (
    <ScreenFrame>
      <TopBar title="Откуда моя фамилия?" kicker="Не родословная" onBack={nav.back} />
      <p className="max-w-xl text-muted">
        Фамилия подскажет возможное значение и где искать дальше. Она не доказывает родство.
      </p>
      <form
        className="glass mt-4 grid gap-3 rounded-4xl p-5"
        onSubmit={(event) => {
          event.preventDefault();
          const next = explainSurname(surname, region, known);
          if ("error" in next) {
            setError(next.error);
            setResult(null);
            return;
          }
          setError("");
          setResult(next);
        }}
      >
        <Field label="Фамилия">
          <input className="field" value={surname} onChange={(event) => setSurname(event.target.value)} placeholder="Например, Смирнова" />
        </Field>
        <Field label="Регион" hint="Откуда семья, если это известно.">
          <input className="field" list="regions" value={region} onChange={(event) => setRegion(event.target.value)} placeholder="Вятка, Одесса, Урал" />
          <datalist id="regions">
            {REGIONS.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        </Field>
        <Field label="Что уже известно о семье">
          <textarea className="field min-h-24" value={known} onChange={(event) => setKnown(event.target.value)} placeholder="Девичья фамилия, село, кем работал дед" />
        </Field>
        {error ? <p className="text-sm text-rose-deep">{error}</p> : null}
        <Button type="submit">Разобрать фамилию</Button>
      </form>
      <p className="mt-3 text-sm font-medium text-ink">Фамилия ≠ доказательство родства.</p>
      {result ? <Result reading={result} /> : null}
    </ScreenFrame>
  );
}

function Result({ reading }: { reading: SurnameReading }) {
  return (
    <div className="mt-4 grid gap-3">
      <section className="glass rounded-4xl p-5">
        <p className="text-sm text-rose-deep">{reading.surname}</p>
        <h2 className="mt-1 font-display text-2xl text-ink">Возможное происхождение</h2>
        <p className="mt-2 text-ink">{reading.origin}</p>
        <p className="mt-3 text-sm text-muted">{reading.formation}</p>
      </section>
      {reading.variants.length > 0 ? (
        <section className="glass rounded-4xl p-5">
          <h2 className="font-display text-2xl text-ink">Возможные варианты написания</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {reading.variants.map((item) => (
              <li key={item} className="rounded-full bg-blush px-3 py-1 text-sm text-ink">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="glass rounded-4xl p-5">
        <h2 className="font-display text-2xl text-ink">Где такое написание встречается</h2>
        <ul className="mt-3 grid gap-2 text-sm text-ink">
          {reading.regions.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section className="wash-sage rounded-4xl p-5">
        <h2 className="font-display text-2xl text-ink">Что проверить дальше</h2>
        <ol className="mt-3 grid list-decimal gap-2 pl-5 text-sm text-ink">
          {reading.next.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-muted">{reading.knownNote}</p>
      </section>
      <p className="rounded-3xl bg-night px-4 py-3 text-sm text-paper">Фамилия ≠ доказательство родства. Однофамилец — ещё не родня.</p>
    </div>
  );
}
