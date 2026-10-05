import { createContext, useContext, useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BookOpen, ChevronLeft, GraduationCap, Home, MessageCircle, PenLine, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Screen } from "@/lib/rod/types";

export type Nav = {
  go: (screen: Screen) => void;
  back: () => void;
  tab: (screen: Screen) => void;
  replace: (screen: Screen) => void;
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
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "soft" | "night" | "white" }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
        variant === "primary" && "bg-night text-paper shadow-[0_10px_24px_-12px_rgba(42,36,32,0.6)] hover:bg-ink",
        variant === "ghost" && "bg-white/0 text-ink hover:bg-white/50",
        variant === "soft" && "glass text-ink hover:bg-white/70",
        variant === "night" && "bg-rose-deep text-paper hover:bg-rose",
        variant === "white" && "bg-white text-ink shadow-[0_10px_24px_-14px_rgba(42,36,32,0.5)]",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children, hint }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function TopBar({ title, kicker, onBack, action }: { title: string; kicker?: string; onBack?: () => void; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      {onBack ? (
        <button type="button" onClick={onBack} className="glass grid size-11 shrink-0 place-items-center rounded-full text-ink" aria-label="Назад">
          <ChevronLeft className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1 pt-0.5">
        {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-deep/80">{kicker}</p> : null}
        <h1 className="display-title mt-1 text-[2.1rem] leading-[1.05] text-ink sm:text-5xl">{title}</h1>
      </div>
      {action}
    </div>
  );
}

const TABS: { id: string; label: string; icon: typeof BookOpen; screen: Screen }[] = [
  { id: "home", label: "Главная", icon: Home, screen: { id: "home" } },
  { id: "book", label: "Книга", icon: BookOpen, screen: { id: "book" } },
  { id: "cards", label: "Вопросы", icon: MessageCircle, screen: { id: "cards" } },
  { id: "stories", label: "Истории", icon: PenLine, screen: { id: "stories" } },
  { id: "lessons", label: "Уроки", icon: GraduationCap, screen: { id: "lessons" } },
];

export function tabKey(screen: Screen): string {
  if (screen.id === "lessons" || screen.id === "lesson") return "lessons";
  if (screen.id === "cards" || screen.id === "deck") return "cards";
  if (screen.id === "stories" || screen.id === "wizard" || screen.id === "story") return "stories";
  if (screen.id === "book" || screen.id === "editor" || screen.id === "flip") return "book";
  return "home";
}

export function Dock() {
  const nav = useNav();
  const current = tabKey(nav.screen);
  return (
    <nav className="dock no-print fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden">
      <ul className="glass-strong mx-auto grid max-w-md grid-cols-5 rounded-[1.6rem] p-1.5">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => nav.tab(item.screen)}
                className={cn(
                  "flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-[1.2rem] text-[11px] font-medium transition",
                  active ? "bg-night text-paper" : "text-ink/70",
                )}
              >
                <Icon className="size-[1.15rem]" strokeWidth={active ? 2.2 : 1.7} />
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
    <aside className="glass no-print sticky top-6 hidden h-fit flex-col gap-1 rounded-[2rem] p-3 lg:flex">
      <p className="display-title px-3 pb-2 pt-2 text-2xl text-ink">Книга рода</p>
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = current === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => nav.tab(item.screen)}
            className={cn("flex min-h-11 items-center gap-3 rounded-full px-3 text-left text-sm font-medium", active ? "bg-night text-paper" : "text-ink hover:bg-white/60")}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        );
      })}
      <button type="button" onClick={() => nav.go({ id: "archive", tab: "people" })} className="mt-2 flex min-h-11 items-center gap-3 rounded-full px-3 text-left text-sm text-muted hover:bg-white/60">
        Архив семьи
      </button>
    </aside>
  );
}

export function ScreenFrame({ children }: { children: ReactNode }) {
  return <div className="rise mx-auto w-full max-w-3xl">{children}</div>;
}

/** Нижняя шторка. Закрывается крестиком, тапом по фону и кнопкой «Назад» телефона не перехватывает. */
export function Sheet({
  title,
  onClose,
  children,
  className,
  dim = true,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  dim?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div
      className={cn("fixed inset-0 z-[60] flex items-end justify-center p-2 sm:items-center sm:p-4", dim ? "bg-ink/30 backdrop-blur-[2px]" : "pointer-events-none")}
      role="dialog"
      aria-modal={dim}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={cn("glass-strong sheet-in pointer-events-auto max-h-[86svh] w-full max-w-lg overflow-auto rounded-[2rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]", className)}>
        <div className="mb-3 flex items-start justify-between gap-3">
          {title ? <h2 className="display-title text-[1.7rem] leading-tight text-ink">{title}</h2> : <span />}
          <button type="button" className="grid size-9 shrink-0 place-items-center rounded-full bg-white/70 text-ink" onClick={onClose} aria-label="Закрыть">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
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
