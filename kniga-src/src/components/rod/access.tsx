import { useState } from "react";
import { BookCopy, Bell, Check, Cloud, Lock, MessageCircle, Send, UserRound } from "lucide-react";
import { RoomBell, RoomTiles, useRoomStatus } from "@/components/rod/room-status";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { MediaImg } from "@/components/rod/media-img";
import { CustomInterviewSheet } from "@/components/rod/send-interview";
import { PaySheet } from "@/components/rod/lessons";
import { LoginScreen } from "@/components/rod/login-screen";
import { COURSE_COMMUNITY_URL } from "@/lib/rod/course-lessons";
import { PROGRAM_PRICE } from "@/lib/rod/content";
import { exportBook } from "@/lib/rod/backup";
import { useRod } from "@/lib/rod/store";

const PAID_GAINS = [
  "Вход по почте: книга открывается на любом телефоне и компьютере",
  "Книга хранится в облаке, а не только на этом устройстве",
  "До трёх книг: для каждой своя линия семьи",
  "Уроки с видео, ИИ-помощник и шаблоны на 100 страниц",
  "Сообщество «Книги рода»",
];

/** Кнопка-профиль в шапке «Главной»: рядом с ней сразу понятно, где вход и что он даёт. */
export function ProfileButton({ onClick }: { onClick: () => void }) {
  const paid = useRod((state) => state.programOpen);
  return (
    <button type="button" onClick={onClick} className="glass relative grid size-11 place-items-center rounded-full text-ink" aria-label="Мой доступ и вход">
      <UserRound className="size-5" />
      {paid ? <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-sage ring-2 ring-paper" aria-hidden /> : null}
    </button>
  );
}

/** «Мой доступ»: что у человека сейчас и зачем нужен вход. */
export function AccessSheet({ onClose, onBooks }: { onClose: () => void; onBooks: () => void }) {
  const paid = useRod((state) => state.programOpen);
  const [pay, setPay] = useState<null | "buy">(null);
  const [login, setLogin] = useState(false);
  const copy = () =>
    void exportBook()
      .then((mode) => mode !== "cancelled" && toast(mode === "shared" ? "Копия готова: выберите «Сохранить в Файлы»" : "Копия сохранена в «Загрузки»"))
      .catch(() => toast("Копия не сохранилась"));
  if (pay) return <PaySheet initialMode={pay} onClose={() => setPay(null)} />;
  if (login) return <LoginScreen onClose={() => setLogin(false)} onBuy={() => setPay("buy")} />;
  return (
    <Sheet title="Мой доступ" onClose={onClose}>
      {paid ? (
        <>
          <div className="flex items-start gap-3 rounded-2xl bg-sage-soft/70 p-4">
            <Cloud className="mt-0.5 size-5 shrink-0 text-moss" />
            <p className="text-sm text-ink">
              <span className="block font-semibold">Полный доступ открыт</span>
              Ваша книга сохраняется в облаке. Чтобы увидеть её на другом устройстве, нажмите «Войти по почте» и впишите почту оплаты.
            </p>
          </div>
          <div className="mt-4 grid gap-2">
            <Button variant="soft" className="min-h-12" onClick={() => { onClose(); onBooks(); }}>
              <BookCopy className="size-4" /> Мои книги
            </Button>
            <Button variant="soft" className="min-h-12" onClick={() => setLogin(true)}>
              <Cloud className="size-4" /> Войти по почте на этом устройстве
            </Button>
            <a href={COURSE_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-burgundy px-5 text-sm font-semibold text-paper no-underline">
              <MessageCircle className="size-4" /> Вступить в сообщество
            </a>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-2xl bg-white/60 p-4 text-sm text-ink">
            <p className="font-semibold">Сейчас вы пользуетесь бесплатно</p>
            <p className="mt-1 text-muted">Входить никуда не нужно. Книга хранится только в этом телефоне или браузере. Если очистить данные браузера, она пропадёт, поэтому сохраняйте копию в файл после каждой работы.</p>
            <Button variant="soft" className="mt-3 min-h-11" onClick={copy}>Сохранить копию книги</Button>
          </div>
          <div className="mt-4 rounded-2xl bg-burgundy-soft/45 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-burgundy">Что даёт полный доступ</p>
            <ul className="mt-3 grid gap-2.5">
              {PAID_GAINS.map((text) => (
                <li key={text} className="flex gap-3 text-sm text-ink">
                  <Check className="mt-0.5 size-4 shrink-0 text-burgundy" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted">Платёж один раз, без подписки.</p>
            <Button className="btn-glass-green mt-4 h-auto min-h-12 w-full whitespace-normal py-3" onClick={() => setPay("buy")}>
              <span className="text-center">Открыть полный доступ <span className="whitespace-nowrap">· {PROGRAM_PRICE}</span></span>
            </Button>
          </div>
          <button type="button" className="mt-4 min-h-11 text-left text-sm font-semibold text-moss underline underline-offset-2" onClick={() => setLogin(true)}>
            Уже оплатили? Войти по почте
          </button>
        </>
      )}
    </Sheet>
  );
}

/** Спокойная строка-приглашение на «Главной» для тех, у кого полного доступа ещё нет: без списков и цветных заливок. */
export function TariffCard({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="mt-4 flex w-full items-center gap-4 rounded-2xl border border-burgundy/25 bg-paper/70 px-4 py-3.5 text-left transition active:scale-[0.99]">
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-burgundy">Полный доступ</span>
        <span className="mt-0.5 block text-[15px] font-semibold leading-snug text-ink">Вход, облако и до трёх книг</span>
        <span className="mt-0.5 block text-sm text-muted">Один платёж, без подписки</span>
      </span>
      <span className="btn-glass-green shrink-0 rounded-full px-4 py-2 text-sm font-semibold">{PROGRAM_PRICE}</span>
    </button>
  );
}

/** У оплативших вместо бесплатного урока: вход в сообщество. */
export function CommunityCard() {
  return (
    <section className="story-card mt-9 rounded-3xl p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-ink">Для тех, кто с нами</p>
      <h2 className="mt-1 text-[1.35rem] font-semibold leading-tight text-ink">Сообщество «Книги рода»</h2>
      <p className="mt-2 max-w-[34ch] text-[15px] text-ink/80">Здесь делятся находками, отвечают на вопросы и показывают свои книги.</p>
      <a href={COURSE_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-moss px-5 text-sm font-semibold text-paper no-underline">
        <MessageCircle className="size-4" /> Вступить в сообщество
      </a>
    </section>
  );
}

/** «Собирайте книгу вместе с родственниками»: на «Главной» на месте сообщества. Фото родных, приглашение, вопросы и их ответы. Платным открывает приглашение, остальным рассказывает, что входит. */
export function TogetherCard({ onOpenFamily, onOpenTariff }: { onOpenFamily: () => void; onOpenTariff: () => void }) {
  const paid = useRod((state) => state.programOpen);
  const [locked, setLocked] = useState(false);
  const [custom, setCustom] = useState(false);
  const photos = useRod((state) => state.photos);
  const { room, waiting, stats, notify, turnOn } = useRoomStatus();
  // Фото людей: по одному на человека, самые свежие.
  const faces: typeof photos = [];
  const seen = new Set<string>();
  for (const photo of [...photos].reverse()) {
    const key = photo.personId || photo.id;
    if (seen.has(key) || !photo.dataUrl) continue;
    seen.add(key);
    faces.push(photo);
    if (faces.length >= 4) break;
  }
  return (
    <section className="story-card together mt-9 rounded-3xl p-5" aria-label="Собирать книгу вместе с родственниками">
      <div className="together-faces" aria-hidden>
        {faces.map((photo) => (
          <span key={photo.id} className="together-face">
            <MediaImg src={photo.dataUrl} alt="" className="size-full object-cover" />
          </span>
        ))}
        {Array.from({ length: Math.max(1, 4 - faces.length) }).map((_, i) => (
          <span key={`ghost-${i}`} className="together-face together-ghost">
            <img src={`${import.meta.env.BASE_URL}stickers/pack/lace/${["lace_03_t", "lace_08_t", "lace_09_t", "lace_28_t"][i % 4]}.webp`} alt="" draggable={false} className="size-full object-contain p-0.5" />
            {i === 0 ? <span className="together-plus">+</span> : null}
          </span>
        ))}
      </div>
      <div className="mt-4 flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-ink">Вместе с родными</p>
        {paid && room && notify ? <RoomBell /> : null}
      </div>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h2 className="text-[1.35rem] font-semibold leading-tight text-ink">{paid && room ? "Пригласить ещё родственников" : "Собирайте книгу вместе с родственниками"}</h2>
        {paid && waiting > 0 ? <span className="grid min-w-8 shrink-0 place-items-center rounded-full bg-moss px-2.5 py-1 text-sm font-semibold text-paper">{waiting}</span> : null}
      </div>
      <p className="mt-2 max-w-[36ch] text-[15px] leading-snug text-ink/80">
        {paid && waiting > 0
          ? `Родные прислали: ${waiting}. Загляните во «Входящие» и добавьте в книгу.`
          : paid && room
            ? "Ссылка отправлена. Как только родные что-то пришлют, здесь появится число."
            : "Отправьте родственнику вопрос или ссылку: он ответит у себя, добавит фото и рассказ, а всё пришлёт вам готовым."}
      </p>
      {paid && room ? <RoomTiles stats={stats} /> : null}
      <button
        type="button"
        onClick={paid ? onOpenFamily : () => setLocked(true)}
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-moss px-5 text-sm font-semibold text-paper"
      >
        {paid ? <Send className="size-4" /> : <Lock className="size-4" />} {paid && waiting > 0 ? "Открыть входящие" : paid && room ? "Пригласить ещё" : "Пригласить родственника"}
      </button>
      {paid ? (
        <button type="button" onClick={() => setCustom(true)} className="ml-2 mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-moss/40 bg-white/60 px-5 text-sm font-semibold text-moss">
          Составить интервью
        </button>
      ) : null}
      {paid && room && !notify ? (
        <button type="button" onClick={() => void turnOn()} className="ml-2 mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-moss/40 bg-white/60 px-4 text-sm font-semibold text-moss">
          <Bell className="size-4" /> Уведомлять, когда пришлют
        </button>
      ) : null}
      {custom ? <CustomInterviewSheet onClose={() => setCustom(false)} /> : null}
      {locked ? (
        <Sheet title="Только в полном доступе" onClose={() => setLocked(false)}>
          <p className="text-base leading-relaxed text-ink">
            Собирать книгу вместе с родственниками можно в платной программе. Вы отправляете вопрос или ссылку, родственник отвечает у себя, добавляет фото и рассказы, а всё приходит к вам готовым.
          </p>
          <p className="mt-3 text-sm text-ink/70">Бесплатно остаются карточки для игры вместе и книга на этом телефоне.</p>
          <div className="mt-5 grid gap-2">
            <Button
              onClick={() => {
                setLocked(false);
                onOpenTariff();
              }}
            >
              Открыть полный доступ · <span className="whitespace-nowrap">{PROGRAM_PRICE}</span>
            </Button>
            <Button variant="ghost" onClick={() => setLocked(false)}>
              Не сейчас
            </Button>
          </div>
        </Sheet>
      ) : null}
    </section>
  );
}

/** Короткая подсказка рядом с «сохраните копию»: у бесплатных говорит про облако, у платных молчит. */
export function CloudNote({ onOpen, className }: { onOpen: () => void; className?: string }) {
  const paid = useRod((state) => state.programOpen);
  if (paid) return null;
  return (
    <p className={className ?? "mt-2 rounded-xl border border-burgundy/20 bg-burgundy-soft/25 px-3 py-2 text-sm text-ink"}>
      На полном доступе книгу можно загружать в облако: приложение вас запомнит, и книга откроется на любом устройстве.{" "}
      <button type="button" onClick={onOpen} className="font-semibold text-burgundy underline underline-offset-2">Что входит</button>
    </p>
  );
}
