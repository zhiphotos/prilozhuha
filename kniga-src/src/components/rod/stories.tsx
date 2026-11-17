import { toast } from "sonner";
import { Fragment, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Cut } from "@/components/rod/botanica";
import { STORY_TEMPLATES, findTemplate } from "@/lib/rod/content";
import { composeStory } from "@/lib/rod/narrative";
import { useRod } from "@/lib/rod/store";
import { plural } from "@/lib/rod/progress";
import { pageFromStory, pagesFromStoryPhotos } from "@/lib/rod/layouts";
import { Attachments } from "@/components/rod/attachments";
import { TranscribeSheet, minutesLine, useMinutes } from "@/components/rod/transcribe-sheet";
import type { Attachment } from "@/lib/rod/types";
import { DictateButton } from "@/components/rod/dictate-button";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

/** Вырезки из её библиотеки: разделяют группы историй. */
const DIVIDERS = ["peony", "lily_valley", "rosebuds", "daffodil", "stick_rosehip", "driftwood"];

export function StoriesScreen() {
  const nav = useNav();
  const [transcribe, setTranscribe] = useState(false);
  const programOpen = useRod((state) => state.programOpen);
  const stories = useRod((state) => state.stories);
  const removeStory = useRod((state) => state.removeStory);
  const minutes = useMinutes();
  const base = import.meta.env.BASE_URL;
  const dateOf = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  };

  return (
    <ScreenFrame>
      <TopBar
        kicker="Семейные истории"
        title="Расскажи историю"
        action={
          <button type="button" onClick={() => nav.go({ id: "free" })} className="story-pencil grid size-11 shrink-0 place-items-center rounded-full" aria-label="Написать свою историю без темы" title="Написать свою историю без темы">
            <Pencil className="size-5" />
          </button>
        }
      />
      <p className="max-w-xl text-[15px] leading-relaxed text-muted">Выберите тему. Приложение задаст несколько вопросов и соберёт черновик. Его можно поправить, потом он станет страницей вашей книги.</p>
      <button type="button" onClick={() => nav.go({ id: "free" })} className="story-main mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold">
        <Pencil className="size-5" /> Написать свою историю
      </button>

      <div className="story-table mt-6">
        <div className="mb-2 flex items-end justify-between"><h2 className="story-group-label !mb-0">Выберите тему</h2><Cut id="lily_valley" className="-mb-1 w-16 shrink-0" style={{ transform: "rotate(6deg)" }} /></div>
        {stories.length > 0 ? (
          <a href="#saved-stories" className="-mt-1 mb-3 inline-block min-h-9 text-sm font-semibold text-moss underline underline-offset-2">
            К сохранённым историям ({stories.length}) ↓
          </a>
        ) : null}
        <ul data-tour="stories-list" className="grid gap-3.5">
          {STORY_TEMPLATES.map((template, index) => (
            <Fragment key={template.id}>
              {index > 0 && index % 3 === 0 ? (
                <li aria-hidden className="flex items-center gap-3 py-5">
                  <span className="story-seam" />
                  <Cut id={DIVIDERS[(index / 3 - 1) % DIVIDERS.length]} className="w-24 shrink-0" style={{ transform: `rotate(${index % 2 ? -6 : 6}deg)` }} />
                  <span className="story-seam" />
                </li>
              ) : null}
              <li className="relative">
                {index % 3 === 0 ? <img src={`${base}tex/desk/tape.webp`} alt="" draggable={false} className="story-tape" /> : null}
                <button type="button" onClick={() => nav.go({ id: "wizard", templateId: template.id })} data-tone={index % 3} className="story-sheet">
                  <span className="story-count" aria-hidden>{template.questions.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="story-sheet-title block">{template.title}</span>
                    <span className="story-sheet-lead line-clamp-2 block">{template.lead}</span>
                    <span className="mt-1 block text-xs font-semibold text-moss">{plural(template.questions.length, "вопрос", "вопроса", "вопросов")}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-xl text-muted/60">›</span>
                </button>
              </li>
            </Fragment>
          ))}
        </ul>

        <h2 id="saved-stories" className="story-group-label scroll-mt-4" style={{ marginTop: 44 }}>Ваши сохранённые истории{stories.length ? ` (${stories.length})` : ""}</h2>
        {stories.length > 0 ? (
          <ul className="grid gap-3.5">
            {stories.map((story) => (
              <li key={story.id} className="story-saved">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => nav.go({ id: "story", storyId: story.id })}>
                  <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-gold-ink">Сохранено{dateOf(story.createdAt) ? `, ${dateOf(story.createdAt)}` : ""}</span>
                  <span className="story-sheet-title mt-0.5 block">{story.title}</span>
                  <span className="story-sheet-lead line-clamp-2 block">{story.narrative}</span>
                  {story.attachments?.length ? <span className="mt-1 block text-xs text-muted">Вложений: {story.attachments.length}</span> : null}
                </button>
                <button
                  type="button"
                  className="grid min-h-11 shrink-0 place-items-center px-1 text-sm text-muted underline"
                  onClick={() => {
                    if (window.confirm("Удалить историю? Это нельзя отменить.")) removeStory(story.id);
                  }}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-ink/25 px-4 py-5 text-sm text-muted">Пока здесь пусто. Выберите тему выше, и первая история появится тут.</p>
        )}

        {programOpen ? (
          <button type="button" onClick={() => setTranscribe(true)} className="story-kraft relative mt-8 flex min-h-16 w-full items-center gap-3 rounded-2xl px-5 py-3 text-left">
            <img src={`${base}tex/desk/clip.webp`} alt="" draggable={false} className="story-clip" />
            <span>
              <span className="block text-[15px] font-semibold text-ink">Расшифровать интервью</span>
              <span className="block text-sm text-ink/70">Запись разговора в текст, с отметками времени</span>
              <span className="mt-1 block text-xs font-semibold text-ink/80">{minutes ? minutesLine(minutes) : "До 300 минут записи в месяц."}</span>
            </span>
          </button>
        ) : null}
      </div>
      {transcribe ? <TranscribeSheet onClose={() => setTranscribe(false)} /> : null}
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
            <p className="mt-3 text-sm text-muted">Нужен хотя бы один ответ, нужен хотя бы один ответ, чтобы получилась история.</p>
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
