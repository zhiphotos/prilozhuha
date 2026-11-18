import { useState } from "react";
import { ShoppingBag } from "lucide-react";
import { Button, Sheet } from "@/components/rod/chrome";
import { PaySheet } from "@/components/rod/lessons";

type Bubble = { who: "me" | "ai" | "done"; text: string };
export type AiDemo = { id: string; tone: "moss" | "bordo" | "sand" | "stone"; kicker: string; title: string; text: string; limit?: string; soon?: boolean; chat: Bubble[] };

/** Что показываем тем, у кого программа ещё не открыта: как работает каждая ИИ-папка, с живой перепиской и лимитом. */
export const AI_DEMOS: Record<string, AiDemo> = {
  gen: {
    id: "gen",
    tone: "moss",
    kicker: "ИИ-генеалог",
    title: "Спросите про любую семейную загадку",
    text: "Где искать метрики, как читать старую запись, с чего начать поиск. Отвечает по справочникам и называет источник.",
    limit: "5 вопросов в день",
    chat: [
      { who: "me", text: "Где искать метрики села в Бессарабии?" },
      { who: "ai", text: "Начните с Национального архива Молдовы: там книги 1820–1924. Назовите уезд и год." },
      { who: "me", text: "Бендерский уезд, 1894" },
      { who: "done", text: "Источник: метрические книги" },
    ],
  },
  iv: {
    id: "iv",
    tone: "bordo",
    kicker: "Интервью",
    title: "Голос бабушки становится текстом",
    text: "Запишите разговор и получите расшифровку. ИИ найдёт в ней людей, места, события, увлечения и традиции, ничего не придумывая.",
    limit: "до 300 минут записи в месяц",
    chat: [
      { who: "me", text: "Запись разговора с бабушкой, 42 минуты" },
      { who: "ai", text: "Расшифровала. Нашла 12 человек, 5 мест, 9 историй и 3 рецепта." },
      { who: "ai", text: "У каждого факта есть цитата и время в записи." },
      { who: "done", text: "Люди готовы для древа" },
    ],
  },
  ch: {
    id: "ch",
    tone: "sand",
    kicker: "Глава",
    title: "Из записи получается глава книги",
    text: "Рассказ по темам с цитатами и вопросами, что уточнить. Отдельно выписаны люди для древа и места для изучения. Можно прислать и свой текст: пять стилей, от тёплого семейного до сказа.",
    limit: "2 главы в день",
    chat: [
      { who: "me", text: "Стиль: тёплый семейный" },
      { who: "ai", text: "Глава: «На берегах Волги»" },
      { who: "ai", text: "Корни, братья и сёстры, свадьба, дача. Внизу вопросы, что уточнить у родных." },
      { who: "done", text: "Люди и места выписаны отдельно" },
    ],
  },
  arc: {
    id: "arc",
    tone: "bordo",
    kicker: "Поиск в архивах",
    title: "ИИ подберёт архивы под вашего предка",
    text: "Составит запрос с вариантами написания фамилии и подскажет, как понять, что нашёлся тот самый человек. Кнопка «Найти наводки» живёт в карточке человека в древе.",
    limit: "10 поисков в месяц",
    chat: [
      { who: "me", text: "Балануца, Вятская губерния" },
      { who: "ai", text: "Метрическая книга, 1894: запись о рождении" },
      { who: "ai", text: "Ревизская сказка: семья в селе. Книга памяти: участник войны" },
      { who: "done", text: "Сверьте отчество, возраст и место" },
    ],
  },
  photo: {
    id: "photo",
    tone: "sand",
    kicker: "Скоро",
    title: "Старые фото станут чётче",
    text: "Восстановление старых снимков с ИИ: лица, царапины, потёртости. Появится в приложении следующим.",
    soon: true,
    chat: [
      { who: "me", text: "Фото прадеда, 1938 год" },
      { who: "ai", text: "Убираю царапины и возвращаю лицу чёткость" },
      { who: "done", text: "Готово: до и после рядом" },
    ],
  },
  lay: {
    id: "lay",
    tone: "stone",
    kicker: "Скоро",
    title: "Вёрстка страниц с ИИ",
    text: "ИИ подберёт, как разместить фотографии и текст на странице книги. Появится в приложении после старых фото.",
    soon: true,
    chat: [
      { who: "me", text: "Страница про бабушку, пять фото" },
      { who: "ai", text: "Предлагаю три варианта вёрстки" },
      { who: "done", text: "Выберите и поправьте руками" },
    ],
  },
  doc: {
    id: "doc",
    tone: "moss",
    kicker: "Скоро",
    title: "Рукописные страницы в текст",
    text: "Расшифровка старых писем и записей по фото страницы. Появится позже.",
    soon: true,
    chat: [
      { who: "me", text: "Фото письма 1944 года" },
      { who: "ai", text: "Читаю почерк и пишу текст, сомнительные слова отмечаю" },
      { who: "done", text: "Текст готов, проверьте отмеченное" },
    ],
  },
};

export function AiDemoSheet({ demo, onClose }: { demo: AiDemo; onClose: () => void }) {
  const [pay, setPay] = useState(false);
  if (pay) return <PaySheet onClose={() => setPay(false)} />;
  return (
    <Sheet title={demo.kicker} onClose={onClose}>
      <div className="ai-demo" data-tone={demo.tone} aria-hidden="true">
        {demo.chat.map((b, i) => (
          <p key={`${demo.id}-${i}`} className={`ai-demo-msg ai-demo-${b.who}`} style={{ animationDelay: `${0.25 + i * 0.95}s` }}>{b.text}</p>
        ))}
      </div>
      <h3 className="mt-5 display-title text-2xl leading-tight text-ink">{demo.title}</h3>
      <p className="mt-2 text-base leading-snug text-ink/80">{demo.text}</p>
      {demo.limit ? <p className="mt-3 inline-block rounded-full border border-gold-ink/50 bg-[#f8f5ed] px-3.5 py-1.5 text-sm font-semibold text-gold-ink">{demo.limit}</p> : null}
      {demo.soon ? (
        <p className="mt-3 text-sm text-muted">Эта функция появится позже. Она войдёт в программу.</p>
      ) : (
        <>
          <div className="mt-4 rounded-3xl bg-[#1d3024] p-4 shadow-[0_20px_34px_-20px_rgba(20,22,15,0.8)]">
            <Button className="min-h-14 w-full whitespace-nowrap !bg-[#e6cf9c] px-4 text-[1.1rem] !text-[#241a07] hover:!bg-[#c9ae74]" onClick={() => setPay(true)}>
              <ShoppingBag className="size-5" /> Открыть программу
            </Button>
            <p className="mt-3 text-center text-sm leading-snug text-[#f3f0e8]/85">Единоразовая плата: открывается сразу и остаётся навсегда. Запас обновляется сам.</p>
          </div>
        </>
      )}
    </Sheet>
  );
}
