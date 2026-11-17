import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { fetchRoomStatus, type RoomStats } from "@/lib/rod/family";
import { enablePush, pushPrefs, pushSupport } from "@/lib/rod/push";
import { serverStatus } from "@/lib/rod/server";
import { useRod } from "@/lib/rod/store";

/** Общее для карточек «Вместе с родными» (Главная и вкладка «Люди»): сколько родных ответили, что пришло нового, включены ли уведомления. */
export function useRoomStatus(refreshKey: unknown = 0) {
  const room = useRod((state) => state.room);
  const [waiting, setWaiting] = useState(0);
  const [stats, setStats] = useState<RoomStats>({ people: [], opens: 0 });
  const [live, setLive] = useState(false);
  const [notify, setNotify] = useState(() => pushPrefs().on);
  useEffect(() => {
    void serverStatus().then((status) => setLive(status.rooms));
  }, []);
  // Карточка сама обновляется: при открытии, когда возвращаешься в приложение и раз в минуту.
  useEffect(() => {
    if (!room || !live) return;
    const load = () => void fetchRoomStatus().then((r) => { setWaiting(r.items.length); setStats(r.stats); }).catch(() => undefined);
    load();
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    const timer = window.setInterval(onShow, 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.clearInterval(timer);
    };
  }, [room, live, refreshKey]);
  const turnOn = async () => {
    const support = pushSupport();
    if (support === "need-install") return toast("Чтобы приходили уведомления, поставьте книгу на экран «Домой» и откройте её оттуда.");
    if (support !== "ok") return toast("На этом устройстве уведомления недоступны.");
    try {
      await enablePush(pushPrefs().hour, pushPrefs().days, pushPrefs().bday);
      setNotify(true);
      toast("Готово: когда родственник что-то пришлёт, придёт уведомление.");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось включить уведомления.");
    }
  };
  return { room, waiting, stats, live, notify, turnOn };
}

/** Горящий колокольчик: уведомления на этом устройстве включены. */
export function RoomBell() {
  return (
    <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-moss text-paper shadow-md" title="Уведомления включены" aria-label="Уведомления включены">
      <Bell className="size-4" />
      <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-gold ring-2 ring-paper motion-safe:animate-pulse" />
    </span>
  );
}

/** Две компактные плитки в одну строку: сколько родных ответили и сколько раз открывали приглашение. */
export function RoomTiles({ stats }: { stats: RoomStats }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <div className="flex items-baseline gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 shadow-sm">
        <span className="text-lg font-semibold leading-none text-moss">{stats.people.length}</span>
        <span className="text-xs font-semibold text-ink/60">ответили</span>
      </div>
      <div className="flex items-baseline gap-1.5 rounded-xl bg-white/70 px-3 py-1.5 shadow-sm">
        <span className="text-lg font-semibold leading-none text-ink">{stats.opens}</span>
        <span className="text-xs font-semibold text-ink/60">открыли приглашение</span>
      </div>
    </div>
  );
}
