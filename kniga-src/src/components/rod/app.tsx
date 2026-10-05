import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "sonner";
import { ArchiveScreen } from "@/components/rod/archive";
import { BookScreen } from "@/components/rod/book";
import { CardsScreen, DeckScreen } from "@/components/rod/cards";
import { Dock, NavProvider, SideNav, type Nav } from "@/components/rod/chrome";
import { EditorScreen } from "@/components/rod/editor";
import { FlipBookScreen } from "@/components/rod/flipbook";
import { HomeScreen } from "@/components/rod/home";
import { LessonScreen, LessonsScreen } from "@/components/rod/lessons";
import { Onboarding } from "@/components/rod/onboarding";
import { PhotoNewScreen } from "@/components/rod/photo";
import { StoriesScreen, StoryScreen, WizardScreen } from "@/components/rod/stories";
import { SurnameScreen } from "@/components/rod/surname";
import { migrateCover, migratePage } from "@/lib/rod/layouts";
import { useRod } from "@/lib/rod/store";
import type { Screen } from "@/lib/rod/types";

type HistoryState = { rod: true; stack: Screen[] };

export function RodApp() {
  const onboarded = useRod((state) => state.onboarded);
  const [hydrated, setHydrated] = useState(false);
  const [stack, setStack] = useState<Screen[]>([{ id: "home" }]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  useEffect(() => {
    let alive = true;
    void Promise.resolve(useRod.persist.rehydrate()).finally(() => {
      if (!alive) return;
      useRod.setState((state) => ({
        pages: state.pages.map((page) => migrateCover(migratePage(page), { dedicatee: state.dedicatee, collector: state.collector })),
      }));
      setHydrated(true);
    });
    // Просим браузер не чистить базу книги, когда мало места.
    void navigator.storage?.persist?.().catch(() => false);
    return () => {
      alive = false;
    };
  }, []);

  // Кнопка «Назад» телефона и браузера листает экраны приложения, а не закрывает его.
  useEffect(() => {
    const initial: HistoryState = { rod: true, stack: stackRef.current };
    window.history.replaceState(initial, "");
    const onPop = (event: PopStateEvent) => {
      const state = event.state as HistoryState | null;
      if (state?.rod && Array.isArray(state.stack) && state.stack.length) setStack(state.stack);
      else setStack([{ id: "home" }]);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const push = useCallback((next: Screen[], replace = false) => {
    setStack(next);
    const state: HistoryState = { rod: true, stack: next };
    if (replace) window.history.replaceState(state, "");
    else window.history.pushState(state, "");
    window.scrollTo({ top: 0 });
  }, []);

  const nav: Nav = useMemo(
    () => ({
      screen: stack[stack.length - 1] ?? { id: "home" },
      go: (next) => push([...stackRef.current, next]),
      back: () => {
        if (stackRef.current.length > 1) window.history.back();
        else push([{ id: "home" }], true);
      },
      tab: (next) => push([next]),
      replace: (next) => push([...stackRef.current.slice(0, -1), next], true),
    }),
    [stack, push],
  );

  if (!hydrated) return <Onboarding ready={false} />;
  if (!onboarded) return <Onboarding />;

  const screen = nav.screen;
  const full = screen.id === "editor" || screen.id === "flip";

  return (
    <NavProvider value={nav}>
      {full ? (
        <ScreenView screen={screen} />
      ) : (
        <>
          <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6 lg:py-8">
            <SideNav />
            <main key={stack.length + screen.id} className="min-w-0 pb-32 lg:pb-8">
              <ScreenView screen={screen} />
            </main>
          </div>
          <Dock />
        </>
      )}
      <Toaster position="top-center" toastOptions={{ className: "rod-toast" }} />
    </NavProvider>
  );
}

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen.id) {
    case "home":
      return <HomeScreen />;
    case "book":
      return <BookScreen />;
    case "editor":
      return <EditorScreen key={screen.pageId} pageId={screen.pageId} />;
    case "flip":
      return <FlipBookScreen pageId={screen.pageId} />;
    case "lessons":
      return <LessonsScreen />;
    case "lesson":
      return <LessonScreen lessonId={screen.lessonId} />;
    case "cards":
      return <CardsScreen />;
    case "deck":
      return <DeckScreen situationId={screen.situationId} />;
    case "stories":
      return <StoriesScreen />;
    case "wizard":
      return <WizardScreen templateId={screen.templateId} />;
    case "story":
      return <StoryScreen storyId={screen.storyId} />;
    case "archive":
      return <ArchiveScreen tab={screen.tab} />;
    case "photo-new":
      return <PhotoNewScreen />;
    case "surname":
      return <SurnameScreen />;
    default:
      return <HomeScreen />;
  }
}
