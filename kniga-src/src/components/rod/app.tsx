import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { ArchiveScreen } from "@/components/rod/archive";
import { BookScreen } from "@/components/rod/book";
import { CardsScreen, DeckScreen } from "@/components/rod/cards";
import { Dock, NavProvider, SideNav, type Nav } from "@/components/rod/chrome";
import { HomeScreen } from "@/components/rod/home";
import { LessonScreen, LessonsScreen } from "@/components/rod/lessons";
import { Onboarding } from "@/components/rod/onboarding";
import { PhotoNewScreen } from "@/components/rod/photo";
import { StoriesScreen, StoryScreen, WizardScreen } from "@/components/rod/stories";
import { StudioScreen } from "@/components/rod/studio";
import { SurnameScreen } from "@/components/rod/surname";
import { useRod } from "@/lib/rod/store";
import type { Screen } from "@/lib/rod/types";

export function RodApp() {
  const onboarded = useRod((state) => state.onboarded);
  const [hydrated, setHydrated] = useState(false);
  const [stack, setStack] = useState<Screen[]>([{ id: "home" }]);

  useEffect(() => {
    let alive = true;
    void Promise.resolve(useRod.persist.rehydrate()).finally(() => {
      if (alive) setHydrated(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!hydrated) return <Onboarding ready={false} />;
  if (!onboarded) return <Onboarding />;

  const screen = stack[stack.length - 1] ?? { id: "home" };
  const nav: Nav = {
    screen,
    go: (next) => setStack((current) => [...current, next]),
    back: () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
    tab: (next) => setStack([next]),
  };

  return (
    <NavProvider value={nav}>
      <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-6 lg:py-8">
        <SideNav />
        <main className="min-w-0 pb-28 lg:pb-8">
          <ScreenView screen={screen} />
        </main>
      </div>
      <Dock />
      <Toaster position="top-center" />
    </NavProvider>
  );
}

function ScreenView({ screen }: { screen: Screen }) {
  switch (screen.id) {
    case "home":
      return <StudioScreen />;
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
    case "book":
      return <BookScreen />;
    default:
      return <HomeScreen />;
  }
}
