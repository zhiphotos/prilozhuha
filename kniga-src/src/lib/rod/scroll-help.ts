// Ряды кнопок и шрифтов в панелях редактора листаются вбок и без полосы прокрутки. На телефоне это пальцем,
// а на компьютере колёсико мыши по умолчанию вбок не листает, и человек не видит, что там есть ещё.
// 1) колёсико мыши листает такой ряд вбок; 2) при появлении ряда с продолжением он слегка качается, как подсказка.
import { toast } from "sonner";

const ROW = ".no-scrollbar";
const SEEN_KEY = "kniga-scroll-hint";

const overflows = (el: HTMLElement) => el.scrollWidth > el.clientWidth + 8;
const fine = () => typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* без хранилища подсказка просто покажется снова */
  }
}

/** Качнуть ряд вбок и вернуть назад: показывает, что он листается. */
export function nudgeRow(el: HTMLElement) {
  const far = Math.min(48, el.scrollWidth - el.clientWidth);
  el.scrollTo({ left: far, behavior: "smooth" });
  window.setTimeout(() => el.scrollTo({ left: 0, behavior: "smooth" }), 650);
}

/** Включает колёсико и подсказку внутри редактора. Возвращает функцию отключения. */
export function installScrollHelp(root: HTMLElement): () => void {
  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const row = (event.target as Element | null)?.closest<HTMLElement>(ROW);
    if (!row || !overflows(row)) return;
    const before = row.scrollLeft;
    row.scrollLeft += event.deltaY;
    if (row.scrollLeft !== before) event.preventDefault();
  };
  root.addEventListener("wheel", onWheel, { passive: false });

  let nudged = false;
  const watch = new MutationObserver((mutations) => {
    if (nudged || !fine()) return;
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue;
        const rows = node.matches(ROW) ? [node] : Array.from(node.querySelectorAll<HTMLElement>(ROW));
        const row = rows.find(overflows);
        if (!row) continue;
        nudged = true;
        window.setTimeout(() => {
          if (!row.isConnected) return;
          nudgeRow(row);
          if (!seenBefore()) {
            markSeen();
            toast("Ряд листается колёсиком мыши: прокрутите над кнопками", { duration: 5000 });
          }
        }, 350);
        return;
      }
    }
  });
  watch.observe(root, { childList: true, subtree: true });
  // Панель уже могла открыться до подключения.
  return () => {
    root.removeEventListener("wheel", onWheel);
    watch.disconnect();
  };
}
