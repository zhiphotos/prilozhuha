import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Copy, Gift, Heart, RotateCw, Share2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { PROGRAM_PRICE } from "@/lib/rod/content";
import { GIFT_CARDS, MESSAGE_IDEAS, giftLink, lookOf, readWish, wishLink, type GiftCardId, type GiftInfo, type Wish } from "@/lib/rod/gift";
import { fetchGift, openGift, startGiftCheckout } from "@/lib/rod/gift-api";
import { serverStatus } from "@/lib/rod/server";
import { registerBuiltinFonts } from "@/lib/rod/fonts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GOLD = "#e6cf9c";

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

type OrientationCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/** Наклон карты за пальцем, мышью и гироскопом. Пишем только CSS-переменные, React не перерисовывается. */
function useTilt(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled || reducedMotion()) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, base: number | null = null, gyro = false, asked = false;
    const loop = () => {
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      el.style.setProperty("--rx", `${cy.toFixed(2)}deg`);
      el.style.setProperty("--ry", `${cx.toFixed(2)}deg`);
      el.style.setProperty("--px", (cx / 16).toFixed(3));
      el.style.setProperty("--py", (cy / 14).toFixed(3));
      raf = Math.abs(tx - cx) + Math.abs(ty - cy) > 0.02 ? requestAnimationFrame(loop) : 0;
    };
    const aim = (x: number, y: number) => {
      tx = Math.max(-16, Math.min(16, x));
      ty = Math.max(-14, Math.min(14, y));
      el.classList.add("kcard-live");
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onMove = (event: PointerEvent) => {
      if (gyro) return;
      const r = el.getBoundingClientRect();
      aim(((event.clientX - r.left) / r.width - 0.5) * 32, -((event.clientY - r.top) / r.height - 0.5) * 28);
    };
    const onLeave = () => {
      if (gyro) return;
      aim(0, 0);
      el.classList.remove("kcard-live");
    };
    const onTurn = (event: DeviceOrientationEvent) => {
      if (event.gamma == null || event.beta == null) return;
      gyro = true;
      if (base == null) base = event.beta;
      aim(event.gamma * 0.6, -(event.beta - base) * 0.5);
    };
    const listenGyro = () => window.addEventListener("deviceorientation", onTurn);
    const ctor = (window as unknown as { DeviceOrientationEvent?: OrientationCtor }).DeviceOrientationEvent;
    const onDown = () => {
      if (asked || !ctor?.requestPermission) return;
      asked = true;
      ctor.requestPermission().then((state) => state === "granted" && listenGyro()).catch(() => undefined);
    };
    if (ctor && !ctor.requestPermission) listenGyro();
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("deviceorientation", onTurn);
    };
  }, [enabled]);
  return ref;
}

/** Знак вместо чипа: золотое древо с корнями. */
function TreeMark({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 40 30" className="h-full w-full" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" aria-hidden>
      <path d="M20 27V13M20 18l-6-5M20 16l6-5M20 13l-3-5M20 13l3-5M14 13l-4-1M26 11l4-2" />
      <path d="M20 27c-2 0-4 1-6 2M20 27c2 0 4 1 6 2" opacity=".7" />
      <g fill={color} stroke="none">
        <circle cx="17" cy="7.5" r="1.4" /><circle cx="23" cy="7.5" r="1.4" /><circle cx="10" cy="12" r="1.3" /><circle cx="30" cy="9" r="1.3" /><circle cx="14" cy="13" r="1" /><circle cx="26" cy="11" r="1" /><circle cx="20" cy="5" r="1.6" />
      </g>
    </svg>
  );
}

/** Подарочная карта: пластик с кромкой, бликом и фольгой. Спереди имя, на обороте послание. Одна и та же в мастере, у дарителя и у получателя. */
export function GiftCardFace({
  card,
  to,
  from,
  message,
  heading,
  className,
  flipped = false,
  onFlip,
  tilt = true,
}: {
  card: GiftCardId;
  to: string;
  from: string;
  message: string;
  heading?: string;
  className?: string;
  flipped?: boolean;
  onFlip?: () => void;
  tilt?: boolean;
}) {
  const look = lookOf(card);
  const ref = useTilt(tilt);
  const name = heading ?? (to || "Подарок");
  const nameSize = name.length > 26 ? "kcard-name-s" : name.length > 15 ? "kcard-name-m" : "";
  const text = message || "Здесь будут ваши слова.";
  const textSize = text.length > 320 ? "kcard-msg-s" : text.length > 150 ? "kcard-msg-m" : "";
  const vars = { "--k-bg": look.bg, "--k-ink": look.ink, "--k-accent": look.accent, "--k-rim": look.rim, "--k-edge": look.edge } as CSSProperties;
  const body = (
    <div ref={ref} className="kcard-tilt">
      <div className={`kcard-flip ${flipped ? "is-back" : ""}`}>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className="kcard-rim" style={{ transform: `translateZ(${1.6 - n * 0.8}px)` }} aria-hidden />
        ))}
        <div className="kcard-face kcard-front" aria-hidden={flipped}>
          <span className="kcard-pattern" aria-hidden />
          <span className="kcard-holo-wrap" aria-hidden><span className="kcard-holo" /></span>
          <div className="kcard-content">
            <p className="kcard-emboss kcard-brand">Книга рода</p>
            <div className="kcard-chip" aria-hidden>
              <TreeMark color={card === "ivory" ? "#6b5020" : "#5a4416"} />
            </div>
            <div className="mt-auto flex items-end justify-between gap-[3cqw]">
              <div className="min-w-0">
                <p className="kcard-label">{heading ? "намёк" : "кому"}</p>
                <p className={`kcard-name ${nameSize}`}>{name}</p>
              </div>
              {from ? (
                <div className="min-w-0 max-w-[45%] shrink-0 text-right">
                  <p className="kcard-label">от</p>
                  <p className="kcard-from">{from}</p>
                </div>
              ) : null}
            </div>
          </div>
          <div className="kcard-stub" aria-hidden>
            <span className="kcard-foil kcard-stub-star">✦</span>
            <span className="kcard-stub-text">год доступа</span>
            <span className="kcard-foil kcard-stub-star">✦</span>
          </div>
          <span className="kcard-grain" aria-hidden />
          <span className="kcard-glare-wrap" aria-hidden><span className="kcard-glare" /></span>
        </div>
        <div className="kcard-face kcard-back" aria-hidden={!flipped}>
          <span className="kcard-stripe" aria-hidden />
          <div className="kcard-note">
            <p className={`kcard-msg ${textSize}`}>{text}</p>
            {from ? <p className="kcard-sign">От: {from}</p> : null}
          </div>
          <p className="kcard-back-mark"><span className="kcard-foil">✦</span> Книга рода</p>
          <span className="kcard-grain" aria-hidden />
          <span className="kcard-glare-wrap" aria-hidden><span className="kcard-glare" /></span>
        </div>
      </div>
    </div>
  );
  return (
    <div className={`kcard-scene ${className ?? ""}`} data-look={card} style={vars}>
      <div className="kcard-sway">
        {onFlip ? (
          <button type="button" className="kcard-hit" onClick={onFlip} aria-label={flipped ? "Показать лицевую сторону карты" : "Перевернуть карту и прочитать послание"}>
            {body}
          </button>
        ) : (
          body
        )}
      </div>
      <p className="sr-only">
        Карта «Книга рода», год доступа. Кому: {name}. {from ? `От: ${from}.` : ""} {text}
      </p>
    </div>
  );
}

/** Подсказка под картой: перевернуть. */
function FlipHint({ flipped, onFlip, dark = true }: { flipped: boolean; onFlip: () => void; dark?: boolean }) {
  return (
    <button type="button" onClick={onFlip} className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm ${dark ? "text-[#f3f0e8]/85" : "text-ink/70"}`}>
      <RotateCw className="size-4" /> {flipped ? "Показать лицевую сторону" : "Перевернуть и прочитать"}
    </button>
  );
}

/** Звёзды на фоне: расставлены по кругу, мерцают по очереди. */
function Stars() {
  return (
    <>
      {Array.from({ length: 22 }, (_, i) => (
        <span key={i} className="gift-star text-xs" style={{ left: `${(i * 37 + 11) % 97}%`, top: `${(i * 53 + 7) % 94}%`, animationDelay: `${(i % 7) * 0.6}s`, fontSize: `${10 + (i % 4) * 4}px` }} aria-hidden>
          ✦
        </span>
      ))}
    </>
  );
}

const share = async (title: string, text: string, url: string) => {
  try {
    if (navigator.share) {
      await navigator.share({ title, text, url });
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast("Ссылка скопирована. Вставьте её в сообщение.");
  } catch {
    toast("Не получилось скопировать. Выделите ссылку и скопируйте вручную.");
  }
};

/** Две кнопки под «Купить»: подарить и намекнуть. */
export function GiftActions({ dark = false }: { dark?: boolean }) {
  const [sheet, setSheet] = useState<null | "gift" | "hint">(null);
  const base = dark ? "border-[#c9ae74]/60 text-[#e6cf9c]" : "border-moss/40 text-moss";
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setSheet("gift")} className={`flex min-h-12 items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold ${base}`}>
          <Gift className="size-4" /> Подарить
        </button>
        <button type="button" onClick={() => setSheet("hint")} className={`flex min-h-12 items-center justify-center gap-2 rounded-full border px-3 text-sm font-semibold ${base}`}>
          <Heart className="size-4" /> Намекнуть
        </button>
      </div>
      {sheet === "gift" ? <GiftWizard onClose={() => setSheet(null)} /> : null}
      {sheet === "hint" ? <HintSheet onClose={() => setSheet(null)} /> : null}
    </>
  );
}

type StepId = "design" | "who" | "words" | "time" | "pay";

/** Подарить: по одному вопросу на экране. Шаги: оформление, кому, слова, время, оплата. */
export function GiftWizard({ onClose, preset }: { onClose: () => void; preset?: Partial<{ to: string; from: string }> }) {
  const [card, setCard] = useState<GiftCardId>("ivory");
  const [to, setTo] = useState(preset?.to ?? "");
  const [from, setFrom] = useState(preset?.from ?? "");
  const [message, setMessage] = useState("");
  const [byMail, setByMail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [later, setLater] = useState(false);
  const [day, setDay] = useState("");
  const [hour, setHour] = useState("10:00");
  const [email, setEmail] = useState("");
  const [terms, setTerms] = useState(false);
  const [pd, setPd] = useState(false);
  const [ads, setAds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(true);
  const [stepNo, setStepNo] = useState(0);
  const [flip, setFlip] = useState(false);
  useEffect(() => {
    void serverStatus().then((status) => setLive(status.pay));
    void registerBuiltinFonts();
  }, []);

  const steps: StepId[] = byMail ? ["design", "who", "words", "time", "pay"] : ["design", "who", "words", "pay"];
  const step = steps[Math.min(stepNo, steps.length - 1)]!;
  const deliverAt = byMail && later && day ? new Date(`${day}T${hour || "10:00"}`).getTime() : 0;
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const can: Record<StepId, boolean> = {
    design: true,
    who: Boolean(to.trim()) && (!byMail || EMAIL.test(recipientEmail.trim())),
    words: true,
    time: !later || (Boolean(day) && deliverAt > Date.now()),
    pay: EMAIL.test(email.trim()) && terms && pd,
  };

  const pay = async () => {
    setBusy(true);
    try {
      window.location.href = await startGiftCheckout({ card, to: to.trim(), from: from.trim(), message: message.trim(), recipientEmail: byMail ? recipientEmail.trim() : "", deliverAt }, email.trim(), ads);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось открыть оплату.", { duration: 6000 });
      setBusy(false);
    }
  };

  const title: Record<StepId, string> = { design: "Выберите карту", who: "Кому подарок", words: "Ваши слова", time: "Когда отправить", pay: "Оплата" };
  const doc = (id: string, label: string) => (
    <a className="font-semibold underline" href={`#/legal/${id}`} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
  const check = "mt-0.5 size-5 shrink-0 accent-[#3f4a22]";
  const pick = (active: boolean) => `flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm ${active ? "border-moss bg-sage-soft/60 font-semibold" : "border-ink/15 bg-white/60"}`;

  return (
    <Sheet title="Подарить Книгу рода" onClose={onClose} className="max-w-xl">
      <div className="flex items-end justify-between gap-3">
        <p className="gift-stepno display-title" aria-hidden>{String(stepNo + 1).padStart(2, "0")}</p>
        <div className="flex-1 pb-2">
          <div className="flex gap-1" aria-hidden>
            {steps.map((id, i) => (
              <span key={id} className={`h-[3px] flex-1 rounded-full transition-colors ${i <= stepNo ? "bg-[#c9ae74]" : "bg-ink/10"}`} />
            ))}
          </div>
          <p className="mt-2 text-right text-xs uppercase tracking-[0.16em] text-muted">
            Шаг {stepNo + 1} из {steps.length}
          </p>
        </div>
      </div>
      <h3 className="mt-1 text-xl font-semibold text-ink">{title[step]}</h3>

      <div className={`gift-mini-stage ${step === "design" ? "is-big" : ""}`}>
        <div key={card} className="gift-swap w-full">
          <GiftCardFace card={card} to={to} from={from} message={message || MESSAGE_IDEAS[1]!} flipped={step === "words" || flip} onFlip={() => setFlip(!flip)} className={step === "design" ? "mx-auto w-full max-w-[20rem]" : "mx-auto w-full max-w-[13.5rem]"} />
        </div>
      </div>

      {step === "design" ? (
        <div className="mt-4">
          <div className="grid grid-cols-4 gap-2">
            {GIFT_CARDS.map((item) => (
              <button key={item.id} type="button" onClick={() => { setCard(item.id); setFlip(false); }} aria-label={item.name} aria-pressed={card === item.id} className={`gift-swatch ${card === item.id ? "is-on" : ""}`} style={{ background: item.bg }}>
                <span className="gift-swatch-chip" aria-hidden />
                {card === item.id ? <Check className="absolute right-1.5 top-1.5 size-3.5" style={{ color: item.accent }} /> : null}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-sm font-medium text-ink">{lookOf(card).name}</p>
        </div>
      ) : null}

      {step === "who" ? (
        <div className="mt-4 grid gap-3">
          <label className="block text-sm font-medium text-ink" htmlFor="gift-to">
            Имя того, кому дарите
          </label>
          <input id="gift-to" className="field" value={to} maxLength={40} onChange={(event) => setTo(event.target.value)} placeholder="Например, мама" autoComplete="off" />
          <p className="mt-1 text-sm font-medium text-ink">Как передать подарок</p>
          <button type="button" className={pick(!byMail)} onClick={() => setByMail(false)}>
            <Share2 className="size-4 shrink-0" />
            <span>
              Я сам отправлю ссылку
              <span className="block text-xs font-normal text-muted">После оплаты вы получите ссылку и отправите её в мессенджере.</span>
            </span>
          </button>
          <button type="button" className={pick(byMail)} onClick={() => setByMail(true)}>
            <Gift className="size-4 shrink-0" />
            <span>
              Отправить письмом на почту
              <span className="block text-xs font-normal text-muted">Письмо с открыткой придёт человеку само, сразу или в выбранный день.</span>
            </span>
          </button>
          {byMail ? <input className="field" type="email" inputMode="email" autoComplete="off" value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="Почта получателя" aria-label="Почта получателя" /> : null}
        </div>
      ) : null}

      {step === "words" ? (
        <div className="mt-4 grid gap-3">
          <label className="block text-sm font-medium text-ink" htmlFor="gift-from">
            От кого
          </label>
          <input id="gift-from" className="field" value={from} maxLength={40} onChange={(event) => setFrom(event.target.value)} placeholder="Ваше имя" autoComplete="off" />
          <label className="block text-sm font-medium text-ink" htmlFor="gift-msg">
            Что хотите сказать
          </label>
          <textarea id="gift-msg" className="field min-h-28" value={message} maxLength={600} onChange={(event) => setMessage(event.target.value)} placeholder="Напишите своими словами" />
          <div className="grid gap-2">
            {MESSAGE_IDEAS.map((idea) => (
              <button key={idea} type="button" className="rounded-2xl bg-white/60 px-3 py-2 text-left text-sm text-ink" onClick={() => setMessage(idea)}>
                {idea}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {step === "time" ? (
        <div className="mt-4 grid gap-3">
          <button type="button" className={pick(!later)} onClick={() => setLater(false)}>
            Сразу после оплаты
          </button>
          <button type="button" className={pick(later)} onClick={() => setLater(true)}>
            В выбранный день и час
          </button>
          {later ? (
            <div className="grid grid-cols-2 gap-2">
              <input className="field" type="date" min={today} value={day} onChange={(event) => setDay(event.target.value)} aria-label="День" />
              <input className="field" type="time" value={hour} onChange={(event) => setHour(event.target.value)} aria-label="Час" />
            </div>
          ) : null}
          {later && day && deliverAt <= Date.now() ? <p className="text-sm text-rose-deep">Выберите время, которое ещё не наступило.</p> : null}
        </div>
      ) : null}

      {step === "pay" ? (
        <form className="mt-4 grid gap-3" onSubmit={(event) => { event.preventDefault(); if (can.pay && live) void pay(); }}>
          <div className="rounded-2xl border border-[#c9ae74]/40 bg-white/70 p-3 text-sm text-ink">
            <p>
              Кому: <b>{to || "получатель"}</b>
            </p>
            <p className="mt-1">Уроки и полный доступ на год. <b>{PROGRAM_PRICE}</b>, один раз.</p>
            <p className="mt-1 text-muted">Год начнётся в тот день, когда человек откроет подарок.</p>
          </div>
          <label className="block text-sm font-medium text-ink" htmlFor="gift-email">
            Ваша почта для чека
          </label>
          <input id="gift-email" type="email" inputMode="email" autoComplete="email" className="field" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@mail.ru" />
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
            <input type="checkbox" className={check} checked={terms} onChange={(event) => setTerms(event.target.checked)} />
            <span>Я принимаю {doc("offer", "публичную оферту")} и {doc("terms", "пользовательское соглашение")}, знакомлюсь с {doc("privacy", "политикой обработки данных")}</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
            <input type="checkbox" className={check} checked={pd} onChange={(event) => setPd(event.target.checked)} />
            <span>Я даю {doc("consent-pd", "согласие на обработку персональных данных")}</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-muted">
            <input type="checkbox" className={check} checked={ads} onChange={(event) => setAds(event.target.checked)} />
            <span>Хочу получать новости и предложения. Необязательно.</span>
          </label>
          {!live ? <p className="text-sm text-rose-deep">Оплата сейчас недоступна. Попробуйте чуть позже.</p> : null}
          <Button type="submit" disabled={busy || !can.pay || !live} className="h-auto min-h-12 w-full whitespace-normal py-3">
            {busy ? "Открываю оплату…" : `Оплатить ${PROGRAM_PRICE}`}
          </Button>
          <p className="text-xs text-muted">Оплата на защищённой странице Альфа-Банка картой российского банка. Чек придёт на вашу почту.</p>
        </form>
      ) : null}

      <div className="mt-5 flex gap-2">
        {stepNo > 0 ? (
          <Button variant="soft" onClick={() => { setStepNo(stepNo - 1); setFlip(false); }}>
            Назад
          </Button>
        ) : null}
        {step !== "pay" ? (
          <Button className="flex-1" disabled={!can[step]} onClick={() => { setStepNo(stepNo + 1); setFlip(false); }}>
            Далее
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Намекнуть: красивая ссылка-желание. Серверу ничего не нужно, текст лежит в самой ссылке. */
export function HintSheet({ onClose }: { onClose: () => void }) {
  const [to, setTo] = useState("");
  const [from, setFrom] = useState("");
  const [message, setMessage] = useState("Мне очень хочется собрать книгу о нашей семье. Кажется, это был бы лучший подарок.");
  const [link, setLink] = useState("");
  const make = () => setLink(wishLink({ to: to.trim(), from: from.trim(), message: message.trim() }));
  return (
    <Sheet title="Намекнуть на подарок" onClose={onClose} className="max-w-xl">
      {!link ? (
        <div className="grid gap-3">
          <p className="text-sm text-muted">Я сделаю красивую открытку с вашим желанием. Вы отправите её тому, кто может подарить, а он одним нажатием дарит вам Книгу рода.</p>
          <label className="block text-sm font-medium text-ink" htmlFor="hint-to">
            Кому намекаете
          </label>
          <input id="hint-to" className="field" value={to} maxLength={40} onChange={(event) => setTo(event.target.value)} placeholder="Например, Дима" autoComplete="off" />
          <label className="block text-sm font-medium text-ink" htmlFor="hint-from">
            Ваше имя
          </label>
          <input id="hint-from" className="field" value={from} maxLength={40} onChange={(event) => setFrom(event.target.value)} placeholder="Например, Аня" autoComplete="off" />
          <label className="block text-sm font-medium text-ink" htmlFor="hint-msg">
            Что сказать
          </label>
          <textarea id="hint-msg" className="field min-h-24" value={message} maxLength={400} onChange={(event) => setMessage(event.target.value)} />
          <Button disabled={!from.trim() || !message.trim()} onClick={make}>
            Сделать намёк
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm text-ink">Готово. Отправьте эту ссылку тому, кому намекаете.</p>
          <input className="field" readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label="Ссылка на намёк" />
          <Button onClick={() => void share("Подарок", `${to ? `${to}, ` : ""}у меня для вас намёк.`, link)}>
            <Share2 className="size-4" /> Отправить
          </Button>
          <Button variant="soft" onClick={() => setLink("")}>
            Изменить текст
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function Shell({ children, top = false }: { children: ReactNode; top?: boolean }) {
  useEffect(() => {
    void registerBuiltinFonts();
  }, []);
  return (
    <div className="gift-stage">
      <Stars />
      <div className={`relative mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-5 py-10 text-center ${top ? "justify-start pt-[14vh]" : "justify-center"}`}>{children}</div>
      <Toaster position="top-center" toastOptions={{ className: "rod-toast" }} />
    </div>
  );
}

const leave = () => {
  try {
    window.history.replaceState(null, "", window.location.pathname);
  } catch {
    /* адрес можно не чистить */
  }
  window.location.reload();
};

function useGift(id: string) {
  const [info, setInfo] = useState<GiftInfo | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    let alive = true;
    fetchGift(id)
      .then((value) => alive && setInfo(value))
      .catch((error: unknown) => alive && setProblem(error instanceof Error ? error.message : "Подарок не найден."));
    return () => {
      alive = false;
    };
  }, [id]);
  return { info, problem };
}

/** Что видит получатель: запечатанная открытка, по нажатию она распаковывается, дальше три простых шага. */
export function GiftScreen({ id }: { id: string }) {
  const { info, problem } = useGift(id);
  const [opened, setOpened] = useState(false);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!opened) return;
    const t = window.setTimeout(() => setFlipped(true), reducedMotion() ? 600 : 3600);
    return () => window.clearTimeout(t);
  }, [opened]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const sparks = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const angle = (i / 30) * Math.PI * 2 + (i % 3) * 0.12;
        const radius = 110 + ((i * 47) % 150);
        return { dx: `${Math.round(Math.cos(angle) * radius)}px`, dy: `${Math.round(Math.sin(angle) * radius)}px`, d: `${1.15 + (i % 6) * 0.05}s`, s: 0.7 + (i % 4) * 0.35, r: `${(i % 2 ? 1 : -1) * (40 + (i % 5) * 30)}deg` };
      }),
    [],
  );

  const unwrap = () => {
    if (opened) return;
    setOpened(true);
    try {
      navigator.vibrate?.([30, 50, 70]);
    } catch {
      /* без вибрации */
    }
  };
  const activate = async () => {
    setBusy(true);
    const problemText = await openGift(id, email);
    if (problemText) {
      toast(problemText, { duration: 8000 });
      setBusy(false);
      return;
    }
    toast("Подарок открыт. Добро пожаловать!", { duration: 6000 });
    window.setTimeout(leave, 900);
  };

  if (problem || (info && info.status !== "paid" && info.status !== "opened")) {
    return (
      <Shell>
        <p className="display-title text-center text-3xl" style={{ color: GOLD }}>
          {info?.status === "refunded" ? "Этот подарок возвращён" : info?.status === "unpaid" ? "Подарок ещё не оплачен" : "Подарок не нашёлся"}
        </p>
        <p className="mt-3 text-center text-sm text-[#f3f0e8]/80">{problem || "Если вам прислали эту ссылку, попросите отправить её ещё раз или напишите Дарине."}</p>
      </Shell>
    );
  }
  if (!info) {
    return (
      <Shell>
        <p className="gift-pulse text-[#f3f0e8]/80">Открываю подарок…</p>
      </Shell>
    );
  }

  return (
    <Shell top>
      <div className="h-12">
        {!opened ? (
          <>
            <p className="gift-line text-sm uppercase tracking-[0.24em]" style={{ color: GOLD }}>
              Вам подарок
            </p>
            {info.from ? (
              <p className="gift-line mt-1 text-lg" style={{ animationDelay: "0.2s" }}>
                От: {info.from}
              </p>
            ) : null}
          </>
        ) : (
          <p className="gift-line text-sm uppercase tracking-[0.24em]" style={{ color: GOLD, animationDelay: "1.6s" }}>
            Книга рода на целый год
          </p>
        )}
      </div>

      <div className={`gift-unbox mt-4 w-full max-w-[21rem] ${opened ? "gift-open" : "gift-float"}`}>
        <span className="gift-env-back" aria-hidden />
        <div className="gift-env-card">
          <GiftCardFace card={info.card ?? "ivory"} to={info.to ?? ""} from={info.from ?? ""} message={info.message ?? ""} tilt={opened} flipped={flipped} onFlip={opened ? () => setFlipped(!flipped) : undefined} />
        </div>
        <span className="gift-env-pocket" aria-hidden />
        <span className="gift-env-flap" aria-hidden />
        <span className="gift-seal" aria-hidden>✦</span>
        {!opened ? <button type="button" onClick={unwrap} className="absolute inset-0 z-20 rounded-2xl" aria-label="Открыть подарок" /> : null}
        {opened ? (
          <div className="pointer-events-none absolute inset-0 z-30" aria-hidden>
            <span className="gift-flash" />
            {sparks.map((spark, i) => (
              <span key={i} className="gift-spark text-lg" style={{ "--dx": spark.dx, "--dy": spark.dy, "--d": spark.d, "--s": spark.s, "--r": spark.r } as CSSProperties}>
                ✦
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {!opened ? <p className="gift-pulse mt-8 text-sm text-[#f3f0e8]/85">Нажмите на конверт, чтобы открыть</p> : null}
      {opened ? (
        <div className="gift-line" style={{ animationDelay: "1.9s" }}>
          <FlipHint flipped={flipped} onFlip={() => setFlipped(!flipped)} />
        </div>
      ) : null}

      {opened ? (
        <div className="gift-line gift-panel mt-5 w-full text-left" style={{ animationDelay: "2.3s" }}>
          <p className="text-lg font-semibold">Что дальше</p>
          <ol className="mt-3 grid gap-2.5 text-sm">
            {["Впишите свою почту. Через неё вы будете входить с любого устройства.", "Нажмите «Открыть Книгу рода». Подарок включится сам, вводить коды не нужно.", "Внизу экрана нажмите «Уроки»: там первые шаги, как собрать семейную книгу."].map((line, i) => (
              <li key={line} className="flex gap-3">
                <span className="gift-num">{i + 1}</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
          <input className="field mt-4" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Ваша почта" aria-label="Ваша почта" />
          <Button className="gift-gold-btn mt-3 w-full" disabled={busy} onClick={() => void activate()}>
            {busy ? "Открываю…" : "Открыть Книгу рода"}
          </Button>
          <p className="mt-2 text-xs text-muted">Год доступа начинается сегодня, в день, когда вы открыли подарок.</p>
        </div>
      ) : null}
    </Shell>
  );
}

/** Экран дарителя после оплаты: ссылка, которую нужно отправить. */
export function GiftMadeScreen({ id }: { id: string }) {
  const { info, problem } = useGift(id);
  const link = giftLink(id);
  const [copied, setCopied] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const copy = () =>
    void navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => toast("Не получилось скопировать. Выделите ссылку и скопируйте вручную."));
  if (!info && !problem) {
    return (
      <Shell>
        <p className="gift-pulse text-[#f3f0e8]/80">Проверяю оплату…</p>
      </Shell>
    );
  }
  if (problem || (info && info.status !== "paid" && info.status !== "opened")) {
    return (
      <Shell>
        <p className="display-title text-center text-3xl" style={{ color: GOLD }}>
          Оплата ещё не подтвердилась
        </p>
        <p className="mt-3 text-center text-sm text-[#f3f0e8]/80">Банк иногда отвечает с задержкой. Ссылка придёт вам на почту, как только подарок будет оплачен.</p>
        <Button className="mt-6" onClick={leave}>
          Вернуться в приложение
        </Button>
      </Shell>
    );
  }
  return (
    <Shell>
      <p className="gift-line text-sm uppercase tracking-[0.24em]" style={{ color: GOLD }}>
        Подарок оплачен
      </p>
      <p className="gift-line mt-2 display-title text-[1.9rem] leading-tight" style={{ animationDelay: "0.15s" }}>
        Карта готова
      </p>
      <GiftCardFace card={info?.card ?? "ivory"} to={info?.to ?? ""} from={info?.from ?? ""} message={info?.message ?? ""} flipped={flipped} onFlip={() => setFlipped(!flipped)} className="gift-card-in mt-6 w-full max-w-[20rem]" />
      <FlipHint flipped={flipped} onFlip={() => setFlipped(!flipped)} />
      <div className="gift-panel mt-4 w-full text-left">
        <p className="text-lg font-semibold">Отправьте эту ссылку</p>
        <p className="mt-1 text-sm text-muted">Человек откроет её, увидит открытку и сам включит подарок. Ссылку я продублировала вам на почту.</p>
        <input className="field mt-3" readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label="Ссылка на подарок" />
        <div className="mt-3 grid gap-2">
          <Button className="gift-gold-btn" onClick={() => void share("Подарок", `${info?.to ? `${info.to}, у` : "У"} меня для вас подарок.`, link)}>
            <Share2 className="size-4" /> Отправить
          </Button>
          <Button variant="soft" onClick={copy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Скопировано" : "Скопировать ссылку"}
          </Button>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-center text-sm text-moss underline">
            Посмотреть, как человек увидит открытку
          </a>
        </div>
      </div>
      <button type="button" className="mt-6 text-sm text-[#f3f0e8]/80 underline" onClick={leave}>
        Вернуться в приложение
      </button>
    </Shell>
  );
}

/** Что видит тот, кому намекнули: желание и кнопка «Подарить». */
export function WishScreen({ payload }: { payload: string }) {
  const wish: Wish | null = useMemo(() => readWish(payload), [payload]);
  const [open, setOpen] = useState(false);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setFlipped(true), reducedMotion() ? 300 : 1800);
    return () => window.clearTimeout(t);
  }, []);
  if (!wish || !wish.from) {
    return (
      <Shell>
        <p className="display-title text-center text-3xl" style={{ color: GOLD }}>
          Ссылка не открылась
        </p>
      </Shell>
    );
  }
  return (
    <Shell>
      <p className="gift-line text-sm uppercase tracking-[0.24em]" style={{ color: GOLD }}>
        {wish.to ? `${wish.to}, вам тихонько намекают` : "Вам тихонько намекают"}
      </p>
      <GiftCardFace card="rose" to="" heading="Моё желание" from={wish.from} message={wish.message} flipped={flipped} onFlip={() => setFlipped(!flipped)} className="gift-card-in mt-6 w-full max-w-[20rem]" />
      <FlipHint flipped={flipped} onFlip={() => setFlipped(!flipped)} />
      <Button className="gift-gold-btn mt-5 w-full max-w-[20rem]" onClick={() => setOpen(true)}>
        <Gift className="size-4" /> Исполнить мечту
      </Button>
      <p className="mt-3 max-w-[20rem] text-center text-xs text-[#f3f0e8]/70">Книга рода: приложение, в котором семья собирает свои истории в одну книгу. Подарок на {PROGRAM_PRICE}, платить один раз.</p>
      {open ? <GiftWizard preset={{ to: wish.from }} onClose={() => setOpen(false)} /> : null}
    </Shell>
  );
}
