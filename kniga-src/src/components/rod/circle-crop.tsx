import { useEffect, useRef, useState } from "react";
import { Button, Sheet } from "@/components/rod/chrome";

const VIEW = 260;
const OUT = 512;

/** Кадрирование фото под кружок: двигаем пальцем, масштаб ползунком. Результат – квадратный JPEG 512 px. */
export function CircleCrop({ file, onDone, onCancel }: { file: Blob; onDone: (out: Blob) => void; onCancel: () => void }) {
  const [src, setSrc] = useState("");
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; ox: number; oy: number } | null>(null);
  const img = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const probe = new Image();
    probe.onload = () => setSize({ w: probe.naturalWidth, h: probe.naturalHeight });
    probe.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const base = size.w && size.h ? VIEW / Math.min(size.w, size.h) : 1;
  const dw = size.w * base * zoom;
  const dh = size.h * base * zoom;
  const clamp = (x: number, y: number) => ({
    x: Math.min(Math.max(x, -(dw - VIEW) / 2), (dw - VIEW) / 2),
    y: Math.min(Math.max(y, -(dh - VIEW) / 2), (dh - VIEW) / 2),
  });

  const save = () => {
    const el = img.current;
    if (!el || !size.w) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT;
    canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const k = OUT / VIEW;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, OUT, OUT);
    ctx.drawImage(el, (OUT - dw * k) / 2 + off.x * k, (OUT - dh * k) / 2 + off.y * k, dw * k, dh * k);
    canvas.toBlob((blob) => blob && onDone(blob), "image/jpeg", 0.9);
  };

  return (
    <Sheet title="Кадрирование фото" onClose={onCancel}>
      <div className="grid gap-4">
        <p className="text-sm text-muted">Двигайте фото пальцем, чтобы лицо попало в кружок. Ползунок – масштаб.</p>
        <div className="mx-auto overflow-hidden rounded-full bg-black/10" style={{ width: VIEW, height: VIEW, touchAction: "none" }}>
          <div
            className="relative size-full"
            onPointerDown={(e) => {
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
            }}
            onPointerMove={(e) => {
              const d = drag.current;
              if (d && d.id === e.pointerId) setOff(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y));
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {src ? (
              <img
                ref={img}
                src={src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute max-w-none"
                style={{ width: dw, height: dh, left: (VIEW - dw) / 2 + off.x, top: (VIEW - dh) / 2 + off.y }}
              />
            ) : null}
          </div>
        </div>
        <label className="grid gap-1 text-sm">
          Масштаб
          <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => { const z = Number(e.target.value); setZoom(z); setOff((o) => clamp(o.x, o.y)); }} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="soft" onClick={onCancel}>Отмена</Button>
          <Button onClick={save}>Сохранить фото</Button>
        </div>
      </div>
    </Sheet>
  );
}
