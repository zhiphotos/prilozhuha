import { downloadProgress } from "@/lib/rod/download-progress";
import { env, pipeline, type RawImage } from "@huggingface/transformers";
import { canvasToSticker, layAsSticker } from "@/lib/rod/sticker";

env.allowLocalModels = false;
const wasm = env.backends.onnx.wasm;
if (wasm) {
  wasm.numThreads = 1;
  wasm.proxy = false;
  wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/";
}

type Remover = (image: string) => Promise<RawImage | RawImage[]>;

/** Точная (универсальная) и лёгкая (люди, ~7 МБ; ей хватает памяти телефона). */
export const PRECISE_MODELS = ["briaai/RMBG-1.4", "Xenova/modnet"] as const;
export const LIGHT_MODELS = ["Xenova/modnet", "briaai/RMBG-1.4"] as const;

const cache = new Map<string, Promise<Remover>>();

function loadRemover(models: readonly string[], onProgress?: (label: string) => void): Promise<Remover> {
  const key = models.join("|");
  const hit = cache.get(key);
  if (hit) return hit;
  const ready = (async () => {
    let last: unknown;
    for (const model of models) {
      try {
        onProgress?.("Готовлю вырезку…");
        const session = await pipeline("background-removal", model, {
          dtype: "q8",
          progress_callback: downloadProgress((percent) => `Скачиваю вырезку… ${percent}%`, (label) => onProgress?.(label)),
        });
        return session as Remover;
      } catch (error) {
        last = error;
      }
    }
    throw last;
  })();
  cache.set(key, ready);
  ready.catch(() => cache.delete(key));
  return ready;
}

export async function liftOnClient(dataUrl: string, onProgress?: (label: string) => void, models: readonly string[] = PRECISE_MODELS): Promise<string | null> {
  try {
    const remove = await loadRemover(models, onProgress);
    onProgress?.("Отделяю объект…");
    const raw = await remove(dataUrl);
    const image = Array.isArray(raw) ? raw[0] : raw;
    const canvas = image?.toCanvas?.() as HTMLCanvasElement | undefined;
    if (canvas) {
      const sticker = canvasToSticker(canvas, true);
      if (sticker) return sticker;
    }
  } catch {
    cache.delete(models.join("|"));
  }
  onProgress?.("Вырезаю объект…");
  return layAsSticker(dataUrl).catch(() => null);
}
