import { toast } from "sonner";
import { Fragment, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Cut } from "@/components/rod/botanica";
import { STORY_TEMPLATES, findTemplate } from "@/lib/rod/content";
import { composeStory } from "@/lib/rod/narrative";
import { useRod } from "@/lib/rod/store";
import { pageFromStory, pagesFromStoryPhotos } from "@/lib/rod/layouts";
import { Attachments } from "@/components/rod/attachments";
import type { Attachment } from "@/lib/rod/types";
import { DictateButton } from "@/components/rod/dictate-button";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

/** Вырезки из её библиотеки: разделяют группы историй. */
const DIVIDERS = ["peony", "lily_valley", "rosebuds", "daffodil", "stick_rosehip", "driftwood"];

export function StoriesScreen() {
  const nav = useNav();
  const stories = useRod((state) => state.stories);
  const removeStory = useRod((state) => state.removeStory);

  return (
    <ScreenFrame>
      <TopBar
        kicker="Семейные истории"
        title="Расскажи историю"
        action={
          <button type="button" onClick={() => nav.go({ id: "free" })} className="glass grid size-11 shrink-0 place-items-center rounded-full text-ink" aria-label="Написать свою историю без темы" title="Написать свою историю без темы">
            <Pencil className="size-5" />
          </button>
        }
      />
      <p className="max-w-xl text-muted">
        Нажмите шаблон. Приложение задаст несколько вопросов и соберёт черновик. Его можно поправить перед сохранением – это уже готовая страница вашей книги. Карандашом вверху можно написать свою историю без темы и вопросов, с фото.
      </p>
      {stories.length > 0 ? (
        <ul className="mt-5 grid gap-2">
          {stories.map((story) => (
            <li key={story.id} className="glass flex items-start justify-between gap-3 rounded-3xl p-4">
              <button type="button" className="min-w-0 text-left" onClick={() => nav.go({ id: "story", storyId: story.id })}>
                <p className="font-sans text-lg font-semibold text-ink">{story.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{story.narrative}</p>
                {story.attachments?.length ? <p className="mt-1 text-xs text-muted">Вложений: {story.attachments.length}</p> : null}
              </button>
              <button type="button" className="shrink-0 text-sm text-muted underline" onClick={() => removeStory(story.id)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-5 grid gap-2">
        {STORY_TEMPLATES.map((template, index) => (
          <Fragment key={template.id}>
            {index > 0 && index % 3 === 0 ? (
              <li aria-hidden className="flex items-center gap-3 py-3">
                <span className="h-px flex-1 bg-ink/15" />
                <Cut id={DIVIDERS[(index / 3 - 1) % DIVIDERS.length]} className="w-24 shrink-0" style={{ transform: `rotate(${index % 2 ? -6 : 6}deg)` }} />
                <span className="h-px flex-1 bg-ink/15" />
              </li>
            ) : null}
            <li data-tour={index === 0 ? "stories-list" : undefined}>
              <button
                type="button"
                onClick={() => nav.go({ id: "wizard", templateId: template.id })}
                className="glass flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-4 text-left"
              >
                <span>
                  <span className="block font-medium text-ink">{template.title}</span>
                  <span className="block text-sm text-muted">{template.lead}</span>
                </span>
                <span className="shrink-0 text-sm text-rose-deep">{template.questions.length}</span>
              </button>
            </li>
          </Fragment>
        ))}
      </ul>
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
    const pages = pagesFromStoryPhotos(story.title, images.map((item) => ({ src: item.ref, caption: "" })));
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
      <TopBar
        title={story.title}
        kicker="Глава"
        onBack={nav.back}
        action={
          editing ? null : (
            <button type="button" onClick={startEdit} className="glass grid size-11 shrink-0 place-items-center rounded-full text-ink" aria-label="Править историю" title="Править историю">
              <Pencil className="size-5" />
            </button>
          )
        }
      />
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
          <article className="glass whitespace-pre-wrap rounded-4xl p-6 font-sans text-[17px] leading-relaxed text-ink">{story.narrative}</article>
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
