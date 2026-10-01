import { useMemo, useState } from "react";
import { STORY_TEMPLATES, findTemplate } from "@/lib/rod/content";
import { composeStory } from "@/lib/rod/narrative";
import { useRod } from "@/lib/rod/store";
import { pageFromStory } from "@/lib/rod/layouts";
import { Button, Field, ScreenFrame, TopBar, useNav } from "@/components/rod/chrome";

export function StoriesScreen() {
  const nav = useNav();
  const stories = useRod((state) => state.stories);
  const removeStory = useRod((state) => state.removeStory);

  return (
    <ScreenFrame>
      <TopBar kicker="Семейные истории" title="Расскажи историю" />
      <p className="max-w-xl text-muted">
        Нажмите шаблон. Приложение задаст несколько вопросов и соберёт черновик. Его можно поправить перед сохранением — это прямая страница будущей книги.
      </p>
      {stories.length > 0 ? (
        <ul className="mt-5 grid gap-2">
          {stories.map((story) => (
            <li key={story.id} className="glass flex items-start justify-between gap-3 rounded-3xl p-4">
              <button type="button" className="min-w-0 text-left" onClick={() => nav.go({ id: "story", storyId: story.id })}>
                <p className="font-display text-2xl text-ink">{story.title}</p>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{story.narrative}</p>
              </button>
              <button type="button" className="shrink-0 text-sm text-muted underline" onClick={() => removeStory(story.id)}>
                Удалить
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="mt-5 grid gap-2">
        {STORY_TEMPLATES.map((template) => (
          <li key={template.id}>
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
          <h2 className="font-display text-3xl text-ink">{question.text}</h2>
          <textarea
            className="field mt-4 min-h-32"
            value={answers[question.id] ?? ""}
            placeholder={question.placeholder}
            onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
          />
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
            <p className="mt-3 text-sm text-muted">Нужен хотя бы один ответ, иначе главе не на что опереться.</p>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4">
          <Field label="Название главы">
            <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Готовая история" hint="Это черновик из ваших слов. Поправьте тон, ничего не выдумывая за семью.">
            <textarea className="field min-h-64" value={draft || narrative} onChange={(event) => setDraft(event.target.value)} />
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

export function StoryScreen({ storyId }: { storyId: string }) {
  const nav = useNav();
  const story = useRod((state) => state.stories.find((item) => item.id === storyId));
  const addPage = useRod((state) => state.addPage);
  const inBook = useRod((state) => state.pages.find((page) => page.promptId === `story:${storyId}`));
  if (!story) {
    return (
      <ScreenFrame>
        <TopBar title="История не найдена" onBack={nav.back} />
      </ScreenFrame>
    );
  }
  return (
    <ScreenFrame>
      <TopBar title={story.title} kicker="Глава" onBack={nav.back} />
      <article className="glass whitespace-pre-wrap rounded-4xl p-6 font-display text-xl leading-relaxed text-ink">{story.narrative}</article>
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
      </div>
    </ScreenFrame>
  );
}
