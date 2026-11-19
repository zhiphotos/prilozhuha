import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Check, Copy, Gift, Heart, Share2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { PROGRAM_PRICE } from "@/lib/rod/content";
import { GIFT_CARDS, MESSAGE_IDEAS, giftLink, lookOf, readWish, wishLink, type GiftCardId, type GiftInfo, type Wish } from "@/lib/rod/gift";
import { fetchGift, openGift, startGiftCheckout } from "@/lib/rod/gift-api";
import { serverStatus } from "@/lib/rod/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const GOLD = "#e6cf9c";

/** Открытка: лицо подарка. Одно и то же в мастере, на экране получателя и в предпросмотре. */
export function GiftCardFace({ card, to, from, message, heading, className }: { card: GiftCardId; to: string; from: string; message: string; heading?: string; className?: string }) {
  const look = lookOf(card);
  return (
    <div className={`relative overflow-hidden rounded-[1.6rem] p-[7%] shadow-[0_28px_44px_-24px_rgba(0,0,0,0.75)] ${className ?? ""}`} style={{ background: look.bg, color: look.ink, aspectRatio: "4 / 5" }}>
      <div className="pointer-events-none absolute inset-[3.5%] rounded-[1.3rem] border" style={{ borderColor: look.edge, opacity: 0.75 }} aria-hidden />
      <div className="relative flex h-full flex-col text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em]" style={{ color: look.accent }}>Книга рода</p>
        {!heading && to ? <p className="mt-[5%] text-xs uppercase tracking-[0.2em] opacity-80">подарок для</p> : null}
        <p className={`${!heading && to ? "mt-1" : "mt-[5%]"} text-[1.9rem] leading-tight`} style={{ fontFamily: '"kr-babushka","Manrope Variable",cursive', color: look.accent }}>
          {heading ?? (to || "Подарок")}
        </p>
        <div className="my-3 flex items-center justify-center gap-2" style={{ color: look.accent }} aria-hidden>
          <span className="h-px w-10" style={{ background: look.edge }} />
          <span>✦</span>
          <span className="h-px w-10" style={{ background: look.edge }} />
        </div>
        <p className="flex-1 overflow-hidden whitespace-pre-line text-[1.05rem] leading-snug">{message || "Здесь будут ваши слова."}</p>
        <p className="mt-3 text-[1.35rem]" style={{ fontFamily: '"kr-babushka","Manrope Variable",cursive', color: look.accent }}>
          {from ? `от ${from}` : ""}
        </p>
      </div>
    </div>
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
  useEffect(() => {
    void serverStatus().then((status) => setLive(status.pay));
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

  const title: Record<StepId, string> = { design: "Выберите открытку", who: "Кому подарок", words: "Ваши слова", time: "Когда отправить", pay: "Оплата" };
  const doc = (id: string, label: string) => (
    <a className="font-semibold underline" href={`#/legal/${id}`} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
  const check = "mt-0.5 size-5 shrink-0 accent-[#3f4a22]";
  const pick = (active: boolean) => `flex min-h-12 w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm ${active ? "border-moss bg-sage-soft/60 font-semibold" : "border-ink/15 bg-white/60"}`;

  return (
    <Sheet title="Подарить Книгу рода" onClose={onClose} className="max-w-xl">
      <div className="flex items-end justify-between">
        <p className="display-title text-[2.4rem] leading-none text-ink">{String(stepNo + 1).padStart(2, "0")}</p>
        <p className="text-xs uppercase tracking-[0.16em] text-muted">
          {stepNo + 1} из {steps.length}
        </p>
      </div>
      <h3 className="mt-2 text-xl font-semibold text-ink">{title[step]}</h3>

      {step === "design" ? (
        <div className="mt-4">
          <GiftCardFace card={card} to={to} from={from} message={message || MESSAGE_IDEAS[1]!} className="mx-auto w-full max-w-[16rem]" />
          <div className="mt-4 grid grid-cols-4 gap-2">
            {GIFT_CARDS.map((item) => (
              <button key={item.id} type="button" onClick={() => setCard(item.id)} aria-label={item.name} aria-pressed={card === item.id} className={`relative h-12 rounded-xl ring-2 ${card === item.id ? "ring-moss" : "ring-transparent"}`} style={{ background: item.bg }}>
                {card === item.id ? <Check className="absolute inset-0 m-auto size-5" style={{ color: item.accent }} /> : null}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-sm text-muted">{lookOf(card).name}</p>
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
          <div className="rounded-2xl bg-white/60 p-3 text-sm text-ink">
            <p>
              Подарок для <b>{to || "получателя"}</b>: уроки и полный доступ на год. <b>{PROGRAM_PRICE}</b>, один раз.
            </p>
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
          <Button variant="soft" onClick={() => setStepNo(stepNo - 1)}>
            Назад
          </Button>
        ) : null}
        {step !== "pay" ? (
          <Button className="flex-1" disabled={!can[step]} onClick={() => setStepNo(stepNo + 1)}>
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

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="gift-stage">
      <Stars />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10 text-center">{children}</div>
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
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const sparks = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => {
        const angle = (i / 30) * Math.PI * 2 + (i % 3) * 0.12;
        const radius = 110 + ((i * 47) % 150);
        return { dx: `${Math.round(Math.cos(angle) * radius)}px`, dy: `${Math.round(Math.sin(angle) * radius)}px`, d: `${(i % 6) * 0.05}s`, s: 0.7 + (i % 4) * 0.35, r: `${(i % 2 ? 1 : -1) * (40 + (i % 5) * 30)}deg` };
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
    <Shell>
      {!opened ? (
        <>
          <p className="gift-line text-sm uppercase tracking-[0.24em]" style={{ color: GOLD }}>
            Вам подарок
          </p>
          {info.from ? (
            <p className="gift-line mt-1 text-lg" style={{ animationDelay: "0.2s" }}>
              от {info.from}
            </p>
          ) : null}
        </>
      ) : null}

      <div className={`relative mt-6 w-full max-w-[18rem] ${opened ? "gift-open" : "gift-float"}`}>
        <button type="button" onClick={unwrap} disabled={opened} className="relative block w-full rounded-[1.6rem] text-left" aria-label="Открыть подарок">
          <GiftCardFace card={info.card ?? "ivory"} to={info.to ?? ""} from={info.from ?? ""} message={info.message ?? ""} className={opened ? "gift-card-in" : ""} />
          <span className="gift-wrap rounded-[1.6rem]" aria-hidden>
            <span className="gift-ribbon-h" />
            <span className="gift-ribbon-v" />
            <span className="gift-seal">✦</span>
          </span>
        </button>
        {opened ? (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {sparks.map((spark, i) => (
              <span key={i} className="gift-spark text-lg" style={{ "--dx": spark.dx, "--dy": spark.dy, "--d": spark.d, "--s": spark.s, "--r": spark.r } as CSSProperties}>
                ✦
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {!opened ? <p className="gift-pulse mt-8 text-sm text-[#f3f0e8]/85">Нажмите на открытку, чтобы открыть</p> : null}

      {opened ? (
        <div className="gift-line mt-8 w-full rounded-3xl bg-[#f3f0e8] p-5 text-left text-ink" style={{ animationDelay: "1.1s" }}>
          <p className="text-lg font-semibold">Что дальше</p>
          <ol className="mt-3 grid gap-2.5 text-sm">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss text-xs font-semibold text-paper">1</span>
              <span>Впишите свою почту. Через неё вы будете входить с любого телефона.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss text-xs font-semibold text-paper">2</span>
              <span>Нажмите «Открыть Книгу рода». Подарок включится сам, вводить коды не нужно.</span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-moss text-xs font-semibold text-paper">3</span>
              <span>Внизу экрана нажмите «Уроки»: там первые шаги, как собрать семейную книгу.</span>
            </li>
          </ol>
          <input className="field mt-4" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Ваша почта" aria-label="Ваша почта" />
          <Button className="mt-3 w-full" disabled={busy} onClick={() => void activate()}>
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
      <GiftCardFace card={info?.card ?? "ivory"} to={info?.to ?? ""} from={info?.from ?? ""} message={info?.message ?? ""} className="gift-card-in mt-5 w-full max-w-[15rem]" />
      <div className="mt-6 w-full rounded-3xl bg-[#f3f0e8] p-5 text-left text-ink">
        <p className="text-lg font-semibold">Отправьте эту ссылку</p>
        <p className="mt-1 text-sm text-muted">Человек откроет её, увидит открытку и сам включит подарок. Ссылку я продублировала вам на почту.</p>
        <input className="field mt-3" readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label="Ссылка на подарок" />
        <div className="mt-3 grid gap-2">
          <Button onClick={() => void share("Подарок", `${info?.to ? `${info.to}, у` : "У"} меня для вас подарок.`, link)}>
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
      <GiftCardFace card="rose" to="" heading="Моё желание" from={wish.from} message={wish.message} className="gift-card-in gift-float mt-6 w-full max-w-[18rem]" />
      <Button className="mt-8 w-full max-w-[18rem] !bg-[#e6cf9c] !text-[#241a07]" onClick={() => setOpen(true)}>
        <Gift className="size-4" /> Подарить {wish.from}
      </Button>
      <p className="mt-3 max-w-[18rem] text-center text-xs text-[#f3f0e8]/70">Книга рода: приложение, в котором семья собирает свои истории в одну книгу. Подарок на {PROGRAM_PRICE}, платить один раз.</p>
      {open ? <GiftWizard preset={{ to: wish.from }} onClose={() => setOpen(false)} /> : null}
    </Shell>
  );
}
