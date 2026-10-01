import { createContext, useContext, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  Archive,
  BookOpen,
  ChevronLeft,
  GraduationCap,
  PenLine,
  MessageCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { Screen } from "@/lib/rod/types";

export type Nav = {
  go: (screen: Screen) => void;
  back: () => void;
  tab: (screen: Screen) => void;
  screen: Screen;
};

const NavContext = createContext<Nav | null>(null);

export function NavProvider({ value, children }: { value: Nav; children: ReactNode }) {
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const value = useContext(NavContext);
  if (!value) throw new Error("Навигация недоступна");
  return value;
}

export function Button({
  variant = "primary",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "soft" | "night" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-rose text-paper hover:bg-rose-deep",
        variant === "ghost" && "bg-transparent text-ink hover:bg-paper/70",
        variant === "soft" && "bg-paper text-ink hover:bg-blush",
        variant === "night" && "bg-night text-paper hover:bg-ink",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TopBar({
  title,
  kicker,
  onBack,
  action,
}: {
  title: string;
  kicker?: string;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="glass grid size-11 shrink-0 place-items-center rounded-full text-ink"
          aria-label="Назад"
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1 pt-0.5">
        {kicker ? <p className="text-sm text-rose-deep">{kicker}</p> : null}
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

const TABS: { id: string; label: string; icon: typeof BookOpen; screen: Screen }[] = [
  { id: "home", label: "Книга", icon: BookOpen, screen: { id: "home" } },
  { id: "cards", label: "Вопросы", icon: MessageCircle, screen: { id: "cards" } },
  { id: "stories", label: "Истории", icon: PenLine, screen: { id: "stories" } },
  { id: "archive", label: "Архив", icon: Archive, screen: { id: "archive", tab: "people" } },
  { id: "lessons", label: "Уроки", icon: GraduationCap, screen: { id: "lessons" } },
];

export function tabKey(screen: Screen): string {
  if (screen.id === "lessons" || screen.id === "lesson") return "lessons";
  if (screen.id === "cards" || screen.id === "deck") return "cards";
  if (screen.id === "stories" || screen.id === "wizard" || screen.id === "story") return "stories";
  if (screen.id === "archive" || screen.id === "photo-new") return "archive";
  return "home";
}

export function Dock() {
  const nav = useNav();
  const current = tabKey(nav.screen);
  return (
    <nav className="dock glass no-print fixed inset-x-0 bottom-0 z-30 border-x-0 border-b-0 px-2 pt-2 lg:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => nav.tab(item.screen)}
                className={cn(
                  "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-2xl text-xs",
                  active ? "text-rose-deep" : "text-muted",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.3 : 1.8} />
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav() {
  const nav = useNav();
  const current = tabKey(nav.screen);
  return (
    <aside className="glass no-print sticky top-6 hidden h-fit flex-col gap-1 rounded-4xl p-3 lg:flex">
      <p className="px-3 pb-2 pt-2 font-display text-2xl text-ink">Книга рода</p>
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => nav.tab(item.screen)}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-full px-3 text-left text-sm font-medium",
              active ? "bg-night text-paper" : "text-ink hover:bg-paper/80",
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
    </aside>
  );
}

export function ScreenFrame({ children }: { children: ReactNode }) {
  return <div className="rise mx-auto w-full max-w-3xl">{children}</div>;
}

export function linkScreen(to: string): Screen {
  switch (to) {
    case "photos":
      return { id: "photo-new" };
    case "stories":
      return { id: "stories" };
    case "cards":
      return { id: "cards" };
    case "surname":
      return { id: "surname" };
    case "book":
      return { id: "book" };
    case "lessons":
      return { id: "lessons" };
    case "places":
      return { id: "archive", tab: "places" };
    case "time":
      return { id: "archive", tab: "time" };
    case "docs":
      return { id: "archive", tab: "docs" };
    default:
      return { id: "archive", tab: "people" };
  }
}
