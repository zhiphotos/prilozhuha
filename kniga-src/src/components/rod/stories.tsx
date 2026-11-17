import { toast } from "sonner";
import { Fragment, useMemo, useState } from "react";
import { Mic, Pencil } from "lucide-react";
import { Cut } from "@/components/rod/botanica";
import { STORY_TEMPLATES, findTemplate } from "@/lib/rod/content";
import { composeStory } from "@/lib/rod/narrative";
import { useRod } from "@/lib/rod/store";
import { plural } from "@/lib/rod/progress";
import { pageFromStory, pagesFromStoryPhotos } from "@/lib/rod/layouts";
import { Attachments } from "@/components/rod/attachments";
import { TranscribeSheet, minutesLine, useMinutes } from "@/components/rod/transcribe-sheet";
import { sendInterview } from "@/lib/rod/ask-relative";
import { SendStoriesSheet } from "@/components/rod/send-interview";
import type { Attachment } from "@/lib/rod/types";
import { DictateButton } from "@/components/rod/dictate-button";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

/** Вырезки из её библиотеки: разделяют группы историй. */
const DIVIDERS = ["peony", "lily_valley", "rosebuds", "daffodil", "stick_rosehip", "driftwood"];

/** Иллюстрация к теме по смыслу: вырезка из библиотеки приложения. */
const TEMPLATE_CUT: Record<string, string> = {
  "first-love": "rose",
  "parents-met": "lily_valley",
  "first-home": "wood_slice",
  "hard-time": "driftwood",
  happiest: "daffodil",
  child: "shell",
  wedding: "peony",
  "little-money": "paper_two_scraps",
  moving: "envelope_brown",
  tradition: "branch",
  "one-photo": "old_notebook",
};

export function StoriesScreen() {
  const nav = useNav();
  const [transcribe, setTranscribe] = useState(false);
  const [askRelative, setAskRelative] = useState(false);
  const programOpen = useRod((state) => state.programOpen);
  const stories = useRod((state) => state.stories);
  const minutes = useMinutes();

  return (
    <ScreenFrame>
      <TopBar kicker="Семейные истории" title="Расскажи историю" />
      <p className="max-w-xl text-base leading-relaxed text-ink/75">Выберите, о чём рассказать, и ответьте на несколько вопросов. Из ответов получится страница вашей книги.</p>
      <button type="button" onClick={() => nav.go({ id: "free" })} className="story-main mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold">
        <Pencil className="size-5" /> Написать свою историю
      </button>
      {programOpen ? (
        <button type="button" onClick={() => setTranscribe(true)} className="story-glass mt-3 flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl px-5 py-3 text-left">
          <span className="story-glass-icon" aria-hidden>
            <Mic className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-ink">Расшифровать интервью</span>
            <span className="block text-[15px] leading-snug text-ink/80">Загрузите запись разговора, например рассказ бабушки, и получите текст</span>
            <span className="mt-0.5 block text-sm font-semibold text-moss">{minutes ? minutesLine(minutes) : "Входит в программу: до 300 минут в месяц."}</span>
          </span>
          <span className="story-ai" aria-label="Работает на искусственном интеллекте" title="Работает на искусственном интеллекте">ИИ</span>
        </button>
      ) : null}

      <button
        type="button"
        onClick={() => {
          if (!programOpen) {
            toast("Отправка вопросов родственникам доступна в платной программе.", { action: { label: "Что входит", onClick: () => nav.tab({ id: "home" }) }, duration: 8000 });
            return;
          }
          setAskRelative(true);
        }}
        className="story-ask mt-3 flex min-h-14 w-full items-center gap-3 rounded-2xl px-5 py-2 text-left"
      >
        <img src={`${import.meta.env.BASE_URL}stickers/pack/leaf_plane.webp`} alt="" draggable={false} className="pointer-events-none w-10 shrink-0 -rotate-6 drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]" />
        <span className="text-base font-semibold text-ink">Отправить вопросы родственнику</span>
      </button>
      {askRelative ? <SendStoriesSheet onClose={() => setAskRelative(false)} /> : null}

      <div className="story-table mt-6">
        <button type="button" onClick={() => nav.go({ id: "my-stories" })} className="story-folder mb-8 flex w-full items-center gap-4 text-left">
          <Cut id="moss_folder" className="story-folder-img" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-gold-ink">Папка</span>
            <span className="story-sheet-title block">Мои истории</span>
            <span className="story-sheet-lead block">{stories.length ? `Сохранено: ${stories.length}` : "Пока пусто. Первая история появится здесь."}</span>
          </span>
          <span aria-hidden className="shrink-0 text-2xl text-ink/60">›</span>
        </button>

        <h2 className="story-group-label">О чём расскажем?</h2>
        <ul data-tour="stories-list" className="grid gap-3.5">
          {STORY_TEMPLATES.map((template, index) => (
            <Fragment key={template.id}>
              {index > 0 && index % 4 === 0 ? (
                <li aria-hidden className="flex items-center gap-3 py-4">
                  <span className="story-seam" />
                  <Cut id={DIVIDERS[(index / 4 - 1) % DIVIDERS.length]} className="w-20 shrink-0" style={{ transform: `rotate(${index % 8 ? -6 : 6}deg)` }} />
                  <span className="story-seam" />
                </li>
              ) : null}
              <li>
                <button type="button" onClick={() => nav.go({ id: "wizard", templateId: template.id })} data-tone={index % 3} className="story-sheet">
                  <span className="story-cut" aria-hidden>
                    <Cut id={TEMPLATE_CUT[template.id] ?? "branch"} className="max-h-14 max-w-14 object-contain" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="story-sheet-title block">{template.title}</span>
                    <span className="story-sheet-lead line-clamp-3 block">{template.lead}</span>
                    <span className="mt-1 block text-sm font-semibold text-moss">{plural(template.questions.length, "короткий вопрос", "коротких вопроса", "коротких вопросов")}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-2xl text-ink/60">›</span>
                </button>
              </li>
            </Fragment>
          ))}
        </ul>
      </div>
      {transcribe ? <TranscribeSheet onClose={() => setTranscribe(false)} /> : null}
    </ScreenFrame>
  );
}

/** Папка «Мои истории»: все сохранённые истории аккаунта. */
export function MyStoriesScreen() {
  const nav = useNav();
  const stories = useRod((state) => state.stories);
  const removeStory = useRod((state) => state.removeStory);
  const dateOf = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  };
  return (
    <ScreenFrame>
      <TopBar kicker="Архив семьи" title="Мои истории" onBack={() => nav.go({ id: "stories" })} />
      <div className="story-folder-head mb-5 flex items-center gap-4">
        <Cut id="moss_folder" className="story-folder-img" />
        <p className="text-base leading-snug text-ink/80">{stories.length ? `Здесь лежат все ваши истории: ${stories.length}. Нажмите на историю, чтобы открыть, поправить или добавить на страницу книги.` : "Здесь будут лежать все ваши истории. Расскажите первую, и она появится в этой папке."}</p>
      </div>
      {stories.length === 0 ? (
        <button type="button" onClick={() => nav.go({ id: "stories" })} className="story-main flex min-h-14 w-full items-center justify-center rounded-2xl px-5 text-base font-semibold">
          Выбрать тему
        </button>
      ) : (
        <ul className="grid gap-3.5">
          {stories.map((story) => (
            <li key={story.id} className="story-saved">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => nav.go({ id: "story", storyId: story.id })}>
                <span className="block text-sm font-semibold text-gold-ink">Ваша история{dateOf(story.createdAt) ? `, ${dateOf(story.createdAt)}` : ""}</span>
                <span className="story-sheet-title mt-0.5 block">{story.title}</span>
                <span className="story-sheet-lead line-clamp-3 block">{story.narrative}</span>
                {story.attachments?.length ? <span className="mt-1 block text-sm text-ink/70">Вложений: {story.attachments.length}</span> : null}
              </button>
              <button
                type="button"
                aria-label={`Удалить историю «${story.title}»`}
                className="grid min-h-11 min-w-11 shrink-0 place-items-center px-1 text-base text-ink/70 underline"
                onClick={() => {
                  if (window.confirm(`Удалить историю «${story.title}»? Это нельзя отменить.`)) removeStory(story.id);
                }}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </ScreenFrame>
  );
}

export function WizardScreen({ templateId }: { templateId: string }) {
  const nav = useNav();
  const addStory = useRod((state) => state.addStory);
  const template = findTemplate(templateId);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(template?.title ?? "");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");

  const review = template ? step >= template.questions.length : false;
  const narrative = useMemo(() => (template ? composeStory(template.id, title, answers) : ""), [template, title, answers]);

  if (!template) {
    return (
      <ScreenFrame>
        <TopBar title="Шаблон не найден" onBack={nav.back} />
      </ScreenFrame>
    );
  }

  const question = template.questions[step];
  const filled = Object.values(answers).some((value) => value.trim());

  const openReview = () => {
    setDraft(composeStory(template.id, title, answers));
    setStep(template.questions.length);
  };

  return (
    <ScreenFrame>
      <TopBar
        title={template.title}
        kicker={review ? "Черновик главы" : `Вопрос ${step + 1} из ${template.questions.length}`}
        onBack={() => {
          if (step === 0) nav.back();
          else setStep((value) => value - 1);
        }}
      />
      {!review && step === 0 ? (
        <button
          type="button"
          onClick={() => {
            if (!useRod.getState().programOpen) {
              toast("Отправка вопросов родственникам доступна в платной программе.");
              return;
            }
            void sendInterview({ kind: "tpl", id: template.id, idx: [] }, template.title, template.questions.length)
              .then((mode) => {
                if (mode === "shared") toast("Отправлено. Ответы придут к вам во входящие.");
                else if (mode === "copied") toast("Текст со ссылкой скопирован: вставьте его в сообщение родственнику.");
              })
              .catch((error) => toast(error instanceof Error ? error.message : "Не получилось отправить.", { duration: 6000 }));
          }}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-moss/40 bg-white/60 px-4 text-sm font-semibold text-moss"
        >
          <img src={`${import.meta.env.BASE_URL}stickers/pack/leaf_plane.webp`} alt="" draggable={false} className="pointer-events-none w-7 -rotate-6" />
          Отправить эти вопросы родственнику
        </button>
      ) : null}
      {!review && question ? (
        <div className="glass rounded-4xl p-5 sm:p-6">
          <h2 className="font-sans text-2xl font-semibold leading-snug text-ink">{question.text}</h2>
          <textarea
            className="field mt-4 min-h-32"
            value={answers[question.id] ?? ""}
            placeholder={question.placeholder}
            onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
          />
          <DictateButton className="mt-2" value={answers[question.id] ?? ""} onChange={(text) => setAnswers((current) => ({ ...current, [question.id]: text }))} />
          <div className="mt-4 flex flex-wrap gap-2">
            {step < template.questions.length - 1 ? (
              <Button onClick={() => setStep((value) => value + 1)}>Дальше</Button>
            ) : (
              <Button onClick={openReview} disabled={!filled}>
                Собрать историю
              </Button>
            )}
            <Button variant="ghost" onClick={() => (step < template.questions.length - 1 ? setStep((value) => value + 1) : openReview())}>
              Пропустить
            </Button>
          </div>
          {!filled && step === template.questions.length - 1 ? (
            <p className="mt-3 text-sm text-muted">Напишите хотя бы один ответ, чтобы получилась история.</p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4">
          <Field label="Название главы">
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Готовая история" hint="Это черновик из ваших слов. Поправьте тон, ничего не выдумывая за семью.">
            <textarea className="field min-h-64" value={draft || narrative} onChange={(event) => setDraft(event.target.value)} />
            <DictateButton className="mt-2" value={draft || narrative} onChange={setDraft} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!(draft || narrative).trim() || !filled}
              onClick={() => {
                const id = addStory({
                  templateId: template.id,
                  title: title.trim() || template.title,
                  answers,
                  narrative: (draft || narrative).trim(),
                });
                nav.replace({ id: "story", storyId: id });
              }}
            >
              Сохранить в книгу
            </Button>
            <Button variant="ghost" onClick={() => setDraft(narrative)}>
              Собрать заново
            </Button>
          </div>
        </div>
      )}
    </ScreenFrame>
  );
}

export function FreeStoryScreen() {
  const nav = useNav();
  const addStory = useRod((state) => state.addStory);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  return (
    <ScreenFrame>
      <TopBar title="Вольная история" kicker="Без темы" onBack={nav.back} />
      <div className="grid gap-4">
        <Field label="Название" hint="Можно оставить пустым.">
          <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="История">
          <textarea className="field min-h-64" value={text} placeholder="Пишите как хотите" onChange={(event) => setText(event.target.value)} />
          <DictateButton className="mt-2" value={text} onChange={setText} />
        </Field>
        <Attachments items={files} onChange={setFiles} />
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!text.trim() && !files.length}
            onClick={() => {
              const id = addStory({
                templateId: "free",
                title: title.trim() || text.trim().split(/\n/)[0].slice(0, 40) || "Моя история",
                answers: {},
                narrative: text.trim(),
                attachments: files,
              });
              nav.replace({ id: "story", storyId: id });
            }}
          >
            Сохранить в книгу
          </Button>
        </div>
      </div>
    </ScreenFrame>
  );
}

export function StoryScreen({ storyId }: { storyId: string }) {
  const nav = useNav();
  const story = useRod((state) => state.stories.find((item) => item.id === storyId));
  const addPage = useRod((state) => state.addPage);
  const updateStory = useRod((state) => state.updateStory);
  const updatePage = useRod((state) => state.updatePage);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftText, setDraftText] = useState("");
  const inBook = useRod((state) => state.pages.find((page) => page.promptId === `story:${storyId}`));
  const photosInBook = useRod((state) => state.pages.some((page) => page.promptId?.startsWith(`story:${storyId}:photos`)));
  if (!story) {
    return (
      <ScreenFrame>
        <TopBar title="История не найдена" onBack={nav.back} />
      </ScreenFrame>
    );
  }
  const images = (story.attachments ?? []).filter((item) => item.kind === "image");
  const addPhotoPages = () => {
    const pages = pagesFromStoryPhotos(story.title, images.map((item) => ({ src: item.ref, caption: item.caption ?? "" })));
    pages.forEach((page, index) => addPage({ ...page, promptId: `story:${story.id}:photos:${index}` }));
    toast(`В книгу добавлено страниц с фото: ${pages.length}`);
  };
  const startEdit = () => {
    setDraftTitle(story.title);
    setDraftText(story.narrative);
    setEditing(true);
  };
  const saveEdit = () => {
    const title = draftTitle.trim() || story.title;
    const narrative = draftText.trim();
    if (!narrative) return toast("Текст истории не может быть пустым");
    updateStory(story.id, { title, narrative });
    // Если история уже стоит в книге, обновляем тот же текст на странице, пока он не правился там руками.
    let synced = false;
    if (inBook && (title !== story.title || narrative !== story.narrative)) {
      updatePage(inBook.id, (page) => ({
        ...page,
        title: title !== story.title && page.title === story.title ? title : page.title,
        blocks: page.blocks.map((block) => {
          if (block.type !== "text") return block;
          if (block.text === story.narrative) {
            synced = true;
            return { ...block, text: narrative };
          }
          if (block.text === story.title) return { ...block, text: title };
          return block;
        }),
      }));
    }
    setEditing(false);
    toast(inBook ? (synced ? "Сохранено, страница в книге обновлена" : "Сохранено. Текст на странице книги вы правили вручную, поэтому она не менялась") : "Сохранено");
  };
  return (
    <ScreenFrame>
      <TopBar title={story.title} kicker="Глава" onBack={nav.back} />
      {editing ? (
        <div className="grid gap-4">
          <Field label="Название главы">
            <input className="field" value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
          </Field>
          <Field label="Текст истории" hint="Дописывайте, что вспомнили позже: изменения сохранятся в этой же истории.">
            <textarea className="field min-h-72" value={draftText} onChange={(event) => setDraftText(event.target.value)} />
            <DictateButton className="mt-2" value={draftText} onChange={setDraftText} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveEdit}>Сохранить</Button>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <article className="glass whitespace-pre-wrap rounded-4xl p-6 pr-14 font-sans text-[17px] leading-relaxed text-ink">{story.narrative}</article>
            {/* Карандаш на углу самого текста: сразу видно, что правится именно эта история. */}
            <button
              type="button"
              onClick={startEdit}
              className="absolute right-2 top-2 grid size-10 place-items-center rounded-full border border-ink/15 bg-paper text-ink shadow-sm"
              aria-label="Править историю"
              title="Править историю"
            >
              <Pencil className="size-[18px]" />
            </button>
          </div>
        </>
      )}
      <Attachments items={story.attachments ?? []} onChange={(next) => updateStory(story.id, { attachments: next })} />
      <div className="mt-4 flex flex-wrap gap-2">
        {inBook ? (
          <Button variant="soft" onClick={() => nav.go({ id: "editor", pageId: inBook.id })}>
            Открыть страницу в книге
          </Button>
        ) : (
          <Button
            onClick={() => {
              const id = addPage({ ...pageFromStory(story.title, story.narrative), promptId: `story:${story.id}` });
              nav.go({ id: "editor", pageId: id });
            }}
          >
            Поставить в книгу
          </Button>
        )}
        {images.length && !photosInBook ? (
          <Button variant="soft" onClick={addPhotoPages}>
            Добавить фото в книгу ({images.length})
          </Button>
        ) : null}
      </div>
    </ScreenFrame>
  );
}
