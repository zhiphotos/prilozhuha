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

const MODELS = ["briaai/RMBG-1.4", "Xenova/modnet"] as const;

let ready: Promise<Remover> | null = null;

function loadRemover(onProgress?: (label: string) => void): Promise<Remover> {
  if (ready) return ready;
  ready = (async () => {
    let last: unknown;
    for (const model of MODELS) {
      try {
        onProgress?.("Готовлю вырезку…");
        const session = await pipeline("background-removal", model, {
          dtype: "q8",
          progress_callback: (update: { status?: string; progress?: number }) => {
            if (update.status === "progress") {
              onProgress?.(`Скачиваю вырезку… ${Math.round(update.progress ?? 0)}%`);
            }
          },
        });
        return session as Remover;
      } catch (error) {
        last = error;
        ready = null;
      }
    }
    throw last;
  })();
  return ready;
}

export async function liftOnClient(dataUrl: string, onProgress?: (label: string) => void): Promise<string | null> {
  try {
    const remove = await loadRemover(onProgress);
    onProgress?.("Отделяю объект…");
    const raw = await remove(dataUrl);
    const image = Array.isArray(raw) ? raw[0] : raw;
    const canvas = image?.toCanvas?.() as HTMLCanvasElement | undefined;
    if (canvas) {
      const sticker = canvasToSticker(canvas, true);
      if (sticker) return sticker;
    }
  } catch {
    ready = null;
  }
  onProgress?.("Вырезаю объект…");
  return layAsSticker(dataUrl).catch(() => null);
}
