// Диктовка. В приложении, добавленном на экран «Домой» в iPhone/iPad, встроенное распознавание Safari не работает,
// поэтому запасной путь: записать голос и расшифровать его прямо на устройстве (модель Whisper, скачивается один раз).
import { recognition } from "@/lib/rod/speech";

export type Dictation = { stop: () => void };

type Handlers = { onStatus: (text: string) => void; onText: (text: string) => void; onEnd: () => void; onError: (message: string) => void };

function standaloneIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  return ios && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export const canRecord = () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";

export function startDictation(handlers: Handlers): Dictation | null {
  const rec = standaloneIos() ? null : recognition();
  if (rec) {
    let fallback = false;
    rec.lang = "ru-RU";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event) => handlers.onText(event.results[0]?.[0]?.transcript ?? "");
    rec.onerror = (event?: unknown) => {
      // К записи голоса переходим, только если распознавание браузера недоступно, а не при «ничего не сказали».
      const code = (event as { error?: string } | undefined)?.error;
      if (!code || ["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"].includes(code)) fallback = true;
    };
    rec.onend = () => {
      if (fallback && canRecord()) {
        const next = startRecording(handlers);
        current = next;
      } else handlers.onEnd();
    };
    handlers.onStatus("Слушаю…");
    let current: Dictation | null = { stop: () => rec.stop() };
    try {
      rec.start();
    } catch {
      return startRecording(handlers);
    }
    return { stop: () => current?.stop() };
  }
  return startRecording(handlers);
}

function startRecording(handlers: Handlers): Dictation | null {
  if (!canRecord()) {
    handlers.onError("Здесь нет доступа к микрофону. Нажмите значок микрофона на клавиатуре телефона — он диктует в любое поле.");
    handlers.onEnd();
    return null;
  }
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let stopped = false;
  const chunks: Blob[] = [];
  void (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        handlers.onEnd();
        return;
      }
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = () => {
        stream?.getTracks().forEach((track) => track.stop());
        void transcribe(new Blob(chunks, { type: recorder?.mimeType || "audio/mp4" }), handlers);
      };
      recorder.start();
      handlers.onStatus("Говорите… Нажмите ещё раз, когда закончите");
    } catch {
      handlers.onError("Микрофон не открылся. Разрешите его для этой страницы в настройках телефона.");
      handlers.onEnd();
    }
  })();
  return {
    stop: () => {
      stopped = true;
      if (recorder && recorder.state !== "inactive") recorder.stop();
    },
  };
}

async function toMono16k(blob: Blob): Promise<Float32Array> {
  const AC = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
  void ctx.close();
  const length = Math.max(1, Math.ceil(buffer.duration * 16000));
  const offline = new OfflineAudioContext(1, length, 16000);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>;
let asr: Promise<Asr> | null = null;

async function transcribe(blob: Blob, handlers: Handlers) {
  try {
    if (blob.size < 1500) {
      handlers.onError("Не услышал голос. Попробуйте ещё раз и говорите чуть дольше.");
      return;
    }
    handlers.onStatus("Расшифровываю…");
    const audio = await toMono16k(blob);
    if (!asr) {
      asr = (async () => {
        const { env, pipeline } = await import("@huggingface/transformers");
        env.allowLocalModels = false;
        const wasm = env.backends.onnx.wasm;
        if (wasm) {
          wasm.numThreads = 1;
          wasm.proxy = false;
          wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/";
        }
        return (await pipeline("automatic-speech-recognition", "Xenova/whisper-base", {
          dtype: "q8",
          progress_callback: (update: { status?: string; progress?: number }) => {
            if (update.status === "progress") handlers.onStatus(`Скачиваю распознавание голоса… ${Math.round(update.progress ?? 0)}% (один раз)`);
          },
        })) as unknown as Asr;
      })();
      asr.catch(() => {
        asr = null;
      });
    }
    const run = await asr;
    const result = await run(audio, { language: "russian", task: "transcribe", chunk_length_s: 30 });
    const text = (Array.isArray(result) ? result.map((r) => r.text).join(" ") : result.text).trim();
    if (text) handlers.onText(text);
    else handlers.onError("Слов не разобрал. Попробуйте ещё раз.");
  } catch {
    handlers.onError("Не получилось расшифровать. Проверьте интернет (в первый раз нужна загрузка модели) или надиктуйте клавиатурой телефона.");
  } finally {
    handlers.onEnd();
  }
}
