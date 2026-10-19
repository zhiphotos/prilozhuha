import { syncPageH } from "@/lib/rod/ink";
import { PAGE_RATIO, heightCm, setPageRatio, type PrintSetup } from "@/lib/rod/page-style";

/** Применяет размеры страницы книги ко всему приложению (экран, печать, штрихи). Возвращает true, если пропорция изменилась. */
export function applyFormat(print: PrintSetup): boolean {
  const ratio = heightCm(print) / print.size;
  if (Math.abs(ratio - PAGE_RATIO) < 1e-6) return false;
  setPageRatio(ratio);
  syncPageH();
  return true;
}
