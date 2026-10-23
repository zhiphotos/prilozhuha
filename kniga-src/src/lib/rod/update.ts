/** Автообновление: приложение само замечает новую версию на сайте и подхватывает её, не дожидаясь, пока человек закроет и откроет его заново. */
import { toast } from "sonner";

const BUILD = /assets\/index-[\w-]+\.js/;

function currentBuild(): string | null {
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="assets/index-"]');
  const match = script?.getAttribute("src")?.match(BUILD);
  return match ? match[0] : null;
}

async function latestBuild(): Promise<string | null> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}index.html?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.text()).match(BUILD)?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Запускается один раз при старте. Возвращает функцию остановки. */
export function startUpdateWatch(): () => void {
  const mine = currentBuild();
  if (!mine) return () => undefined; // режим разработки: имени сборки нет
  let announced = false;
  let hiddenAt = 0;

  const check = async (reloadNow: boolean) => {
    const latest = await latestBuild();
    if (!latest || latest === mine) return;
    if (reloadNow) {
      // Не чаще раза в 5 минут: если сайт ещё отдаёт старую страницу из кэша, не перезагружаемся по кругу.
      try {
        const last = Number(sessionStorage.getItem("kr-update-reload") ?? 0);
        if (Date.now() - last < 5 * 60_000) return;
        sessionStorage.setItem("kr-update-reload", String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
      return;
    }
    if (announced) return;
    announced = true;
    toast("Вышло обновление приложения", {
      duration: Number.POSITIVE_INFINITY,
      action: { label: "Обновить", onClick: () => window.location.reload() },
    });
  };

  const onVisible = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    // Человек вернулся в приложение: если оно висело в фоне дольше минуты и версия новая, обновляем сразу.
    void check(hiddenAt > 0 && Date.now() - hiddenAt > 60_000);
  };

  const first = window.setTimeout(() => void check(false), 15_000);
  const timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void check(false);
  }, 3 * 60_000);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearTimeout(first);
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
