import { useState } from "react";
import { BookCopy, Check, Cloud, MessageCircle, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button, Sheet } from "@/components/rod/chrome";
import { PaySheet } from "@/components/rod/lessons";
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
  const [pay, setPay] = useState<null | "buy" | "restore">(null);
  const copy = () =>
    void exportBook()
      .then((mode) => mode !== "cancelled" && toast(mode === "shared" ? "Копия готова: выберите «Сохранить в Файлы»" : "Копия сохранена в «Загрузки»"))
      .catch(() => toast("Копия не сохранилась"));
  if (pay) return <PaySheet initialMode={pay} onClose={() => setPay(null)} />;
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
            <Button variant="soft" className="min-h-12" onClick={() => setPay("restore")}>
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
            <Button className="mt-4 h-auto min-h-12 w-full whitespace-normal bg-burgundy py-3 hover:bg-burgundy" onClick={() => setPay("buy")}>
              Открыть полный доступ · {PROGRAM_PRICE}
            </Button>
          </div>
          <button type="button" className="mt-4 min-h-11 text-left text-sm font-semibold text-moss underline underline-offset-2" onClick={() => setPay("restore")}>
            Уже оплатили? Войти по почте
          </button>
        </>
      )}
    </Sheet>
  );
}

/** Карточка тарифа на «Главной» для тех, у кого полного доступа ещё нет. */
export function TariffCard({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="mt-9 overflow-hidden rounded-3xl" style={{ background: "linear-gradient(180deg,#f1e4e4,#e6cfd2)", boxShadow: "inset 0 0 0 1px rgb(106 34 52 / 0.18), 0 18px 30px -24px rgb(106 34 52 / 0.6)" }}>
      <div className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-burgundy">Полный доступ</p>
        <h2 className="mt-1 text-[1.35rem] font-semibold leading-tight text-ink">Книга, которую можно открыть где угодно</h2>
        <ul className="mt-3 grid gap-2">
          {PAID_GAINS.slice(0, 4).map((text) => (
            <li key={text} className="flex gap-3 text-sm text-ink">
              <Check className="mt-0.5 size-4 shrink-0 text-burgundy" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button className="bg-burgundy hover:bg-burgundy" onClick={onOpen}>Посмотреть и открыть · {PROGRAM_PRICE}</Button>
          <span className="text-xs text-muted">Один платёж, без подписки</span>
        </div>
      </div>
    </section>
  );
}

/** У оплативших вместо бесплатного урока: вход в сообщество. */
export function CommunityCard() {
  return (
    <section className="mt-9 overflow-hidden rounded-3xl p-5" style={{ background: "linear-gradient(180deg,#7a2a3d,#5d1c2d)", boxShadow: "0 18px 30px -22px rgb(60 14 28 / 0.8)" }}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#e8c9a0]">Для тех, кто с нами</p>
      <h2 className="mt-1 text-[1.35rem] font-semibold leading-tight text-paper">Сообщество «Книги рода»</h2>
      <p className="mt-2 max-w-[32ch] text-sm text-paper/80">Здесь делятся находками, отвечают на вопросы и показывают свои книги.</p>
      <a href={COURSE_COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-paper px-5 text-sm font-semibold text-ink no-underline">
        <MessageCircle className="size-4" /> Вступить в сообщество
      </a>
    </section>
  );
}
