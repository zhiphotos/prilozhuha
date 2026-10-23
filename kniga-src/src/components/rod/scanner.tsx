import { useEffect, useRef, useState } from "react";
import { Camera, Images, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/rod/chrome";
import { saveMedia } from "@/lib/rod/media";
import { autoCorners, canvasBlob, enhance, loadBitmap, warp, type Pt, type ScanMode } from "@/lib/rod/scan";
import { cn } from "@/lib/cn";

const MODES: { id: ScanMode; label: string; hint: string }[] = [
  { id: "photo", label: "Фото", hint: "Старая фотография: ровняем углы и свет" },
  { id: "paper", label: "Лист", hint: "Письмо или документ: белая бумага, чёткий текст" },
  { id: "ink", label: "Почерк", hint: "Написанное от руки на прозрачном фоне, как стикер" },
];

/** Свой сканер: снимок → четыре угла → ровный прямоугольник. Заменяет Google ФотоСкан, у которого нет подключения к другим приложениям. */
export function Scanner({ onDone, onClose }: { onDone: (ref: string, mode: ScanMode) => void; onClose: () => void }) {
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState("");
  const [corners, setCorners] = useState<Pt[]>([]);
  const [mode, setMode] = useState<ScanMode>("photo");
  const [busy, setBusy] = useState(false);
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; id: number } | null>(null);

  useEffect(() => () => setPreview(""), []);

  const load = (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    void loadBitmap(file)
      .then((canvas) => {
        setSource(canvas);
        setPreview(canvas.toDataURL("image/jpeg", 0.8));
        setCorners(autoCorners(canvas));
      })
      .catch((error: unknown) => toast(error instanceof Error ? error.message : "Снимок не открылся"))
      .finally(() => setBusy(false));
  };

  const move = (event: React.PointerEvent) => {
    const d = drag.current;
    const rect = frame.current?.getBoundingClientRect();
    if (!d || d.id !== event.pointerId || !rect || !source) return;
    const x = Math.min(source.width, Math.max(0, ((event.clientX - rect.left) / rect.width) * source.width));
    const y = Math.min(source.height, Math.max(0, ((event.clientY - rect.top) / rect.height) * source.height));
    setCorners((list) => list.map((p, i) => (i === d.index ? { x, y } : p)));
  };

  const finish = () => {
    if (!source) return;
    setBusy(true);
    // Тяжёлая работа с пикселями идёт после перерисовки, чтобы показалась надпись «Обрабатываю».
    window.setTimeout(() => {
      void (async () => {
        try {
          const flat = warp(source, corners);
          const done = enhance(flat, mode);
          const ref = await saveMedia(await canvasBlob(done, mode === "ink"));
          onDone(ref, mode);
        } catch (error) {
          toast(error instanceof Error ? error.message : "Скан не получился");
        } finally {
          setBusy(false);
        }
      })();
    }, 30);
  };

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-night/95 p-3 text-paper">
      <div className="flex items-center justify-between pb-2 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <p className="display-title text-[0.95rem]">Сканер</p>
        <button type="button" className="grid size-10 place-items-center rounded-full bg-white/15" onClick={onClose} aria-label="Закрыть">
          <X className="size-5" />
        </button>
      </div>
      {!source ? (
        <div className="grid flex-1 place-items-center">
          <div className="grid w-full max-w-sm gap-3 text-center">
            <p className="text-sm text-paper/80">Положите фото или письмо на ровную поверхность, снимите сверху. Углы можно будет поправить пальцем, перекос выпрямится сам.</p>
            <Button variant="white" disabled={busy} onClick={() => camera.current?.click()}>
              <Camera className="size-4" /> Снять
            </Button>
            <Button variant="soft" disabled={busy} onClick={() => gallery.current?.click()}>
              <Images className="size-4" /> Выбрать снимок
            </Button>
            <div className="mt-2 rounded-2xl border border-paper/20 bg-paper/10 p-3 text-left text-sm leading-snug text-paper/85">
              <p className="font-semibold text-paper">Для лучшего скана старых фото</p>
              <p className="mt-1">
                Отсканируйте их в приложении Google: оно убирает блики и ровняет края. Потом нажмите «Выбрать снимок» и добавьте готовое фото сюда, как в архив. Все фото хранятся только у вас на телефоне.
              </p>
              <p className="mt-2">
                <a className="font-semibold text-[#c9ae74] underline" href="https://apps.apple.com/ru/app/photoscan-by-google-photos/id1165525994" target="_blank" rel="noopener noreferrer">
                  iPhone: Фотосканер от Google Фото
                </a>
              </p>
              <p className="mt-1">
                <a className="font-semibold text-[#c9ae74] underline" href="https://play.google.com/store/apps/details?id=com.google.android.apps.docs" target="_blank" rel="noopener noreferrer">
                  Android: Google Диск
                </a>{" "}
                (кнопка «+» → «Сканировать»)
              </p>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 items-center justify-center">
            <div ref={frame} className="relative max-h-full max-w-full touch-none select-none" style={{ aspectRatio: `${source.width} / ${source.height}`, height: "min(100%, 62svh)" }} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}>
              <img src={preview} alt="Снимок" draggable={false} className="h-full w-full object-fill" />
              <svg viewBox={`0 0 ${source.width} ${source.height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                <path d={`M${corners.map((p) => `${p.x} ${p.y}`).join("L")}Z`} fill="rgba(255,255,255,.12)" stroke="#fff" strokeWidth={source.width / 300} strokeDasharray={`${source.width / 60} ${source.width / 120}`} />
              </svg>
              {corners.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Угол ${i + 1}`}
                  className="absolute size-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-rose/70 shadow"
                  style={{ left: `${(p.x / source.width) * 100}%`, top: `${(p.y / source.height) * 100}%`, touchAction: "none" }}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    drag.current = { index: i, id: event.pointerId };
                  }}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex gap-2">
            {MODES.map((item) => (
              <button key={item.id} type="button" onClick={() => setMode(item.id)} className={cn("flex-1 rounded-2xl px-3 py-2 text-sm font-semibold", mode === item.id ? "bg-white text-ink" : "bg-white/15 text-paper")}>
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-center text-xs text-paper/70">{MODES.find((item) => item.id === mode)?.hint}</p>
          <div className="mt-2 flex gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Button variant="soft" className="flex-1" disabled={busy} onClick={() => setSource(null)}>
              Другой снимок
            </Button>
            <Button variant="soft" disabled={busy} onClick={() => source && setCorners(autoCorners(source))}>
              Углы заново
            </Button>
            <Button variant="white" className="flex-1" disabled={busy} onClick={finish}>
              {busy ? "Обрабатываю…" : "Готово"}
            </Button>
          </div>
        </>
      )}
      <input ref={gallery} type="file" accept="image/*" className="sr-only" onChange={(event) => { load(event.target.files?.[0]); event.target.value = ""; }} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(event) => { load(event.target.files?.[0]); event.target.value = ""; }} />
    </div>
  );
}
