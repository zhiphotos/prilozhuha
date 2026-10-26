import { createContext, useContext, useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
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
        variant === "primary" && "bg-moss text-paper shadow-[0_10px_24px_-14px_rgba(20,22,15,0.7)] hover:bg-night",
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

/** Размер для фразы «в одну строку»: считается по длине текста, чтобы фраза не переносилась. */
export function lineStyle(text: string): React.CSSProperties {
  return { ["--em" as string]: Math.max(6, text.length * 0.8) };
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
        {kicker ? <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold-ink">{kicker}</p> : null}
        <h1 className={title.length <= 22 ? "display-title one-line mt-1 leading-[1.15] text-ink [--max:2.2rem] [--pad:6.5rem]" : "mt-1 text-[1.5rem] font-semibold leading-[1.2] text-ink"} style={title.length <= 22 ? lineStyle(title) : undefined}>{title}</h1>
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
  if (screen.id === "cards" || screen.id === "deck" || screen.id === "answers") return "cards";
  if (screen.id === "stories" || screen.id === "wizard" || screen.id === "story" || screen.id === "free") return "stories";
  if (screen.id === "book" || screen.id === "editor" || screen.id === "flip") return "book";
  return "home";
}

export function Dock() {
  const nav = useNav();
  const current = tabKey(nav.screen);
  return (
    <nav aria-label="Основная навигация" className="dock no-print fixed inset-x-0 bottom-0 z-30 px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:hidden">
      <ul data-tour="nav" className="glass-strong mx-auto grid max-w-md grid-cols-5 rounded-2xl p-1.5">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = current === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => nav.tab(item.screen)}
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-0.5 rounded-[1.2rem] text-xs font-medium transition [@media(max-height:480px)]:min-h-10",
                  active ? "bg-night text-paper" : "text-ink/70",
                )}
                aria-current={active ? "page" : undefined}
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
    <aside data-tour="nav" className="glass no-print sticky top-6 hidden h-fit flex-col gap-1 rounded-2xl p-3 lg:flex">
      <p className="display-title px-3 pb-2 pt-2 text-[0.95rem] text-ink">Книга рода</p>
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
  const box = useRef<HTMLDivElement>(null);
  const downOnBackdrop = useRef(false);
  /** onClose приходит новой функцией на каждый рендер: держим в ref, иначе эффект перезапускается и отнимает фокус у поля (на iPhone клавиатура сворачивается). */
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (dim) box.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab" && dim && box.current) {
        const items = Array.from(box.current.querySelectorAll<HTMLElement>("button,[href],input,textarea,select,[tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === box.current)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (dim && before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [dim]);
  return createPortal(
    <div
      className={cn("fixed inset-0 z-[60] flex items-end justify-center p-2 sm:items-center sm:p-4", dim ? "bg-ink/30 backdrop-blur-[2px]" : "pointer-events-none")}
      role="dialog"
      aria-modal={dim}
      aria-label={title}
      onPointerDown={(event) => {
        downOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (downOnBackdrop.current && event.target === event.currentTarget) onClose();
        downOnBackdrop.current = false;
      }}
    >
      <div ref={box} tabIndex={-1} className={cn("glass-strong sheet-in pointer-events-auto max-h-[min(86svh,calc(100dvh-1rem))] w-full max-w-lg overflow-auto overscroll-contain rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] outline-none", !dim && "!bg-paper shadow-2xl ring-1 ring-ink/10", className)}>
        <div className="sticky -top-5 z-10 -mx-1 mb-3 flex items-start justify-between gap-3">
          {title ? <h2 className={cn("leading-tight text-ink", title.length <= 16 ? "display-title text-[1.15rem]" : "text-[1.25rem] font-semibold")}>{title}</h2> : <span />}
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full bg-white/80 text-ink" onClick={onClose} aria-label="Закрыть">
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
