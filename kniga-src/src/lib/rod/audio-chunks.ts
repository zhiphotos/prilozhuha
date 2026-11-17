// Нарезка записи на куски для расшифровки. Куски до 60 секунд режутся в самом тихом месте рядом с границей, чтобы не рвать слова.
// Звук приводится к 16 кГц, моно (так Whisper слышит лучше всего и файл маленький): минута занимает около 1,9 МБ.

export const RATE = 16000;
export const CHUNK_SEC = 60;

/** Звук в WAV (16 бит, моно). */
export function encodeWav(samples: Float32Array, rate = RATE): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export function toBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** Границы кусков (индексы отсчётов): примерно каждые `target` секунд, сдвинутые в самое тихое окно в пределах ±`search` секунд. Последний элемент = длина записи. */
export function findCuts(samples: Float32Array, rate = RATE, target = CHUNK_SEC, search = 4): number[] {
  const total = samples.length;
  const cuts: number[] = [];
  const win = Math.max(1, Math.round(rate * 0.05));
  let start = 0;
  while (total - start > (target + search) * rate) {
    const aim = start + target * rate;
    let best = aim;
    let bestEnergy = Infinity;
    for (let at = aim - search * rate; at <= aim + search * rate - win; at += win) {
      let energy = 0;
      for (let i = at; i < at + win; i += 1) energy += Math.abs(samples[i]!);
      if (energy < bestEnergy) {
        bestEnergy = energy;
        best = at + (win >> 1);
      }
    }
    cuts.push(best);
    start = best;
  }
  cuts.push(total);
  return cuts;
}

/** Файл (аудио или видео) в 16 кГц моно. Длинные записи занимают много памяти телефона: ошибка памяти превращается в понятное сообщение. */
export async function decodeMono16k(file: File): Promise<Float32Array> {
  const Ctx = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const frames = Math.ceil(decoded.duration * RATE);
    const off = new OfflineAudioContext(1, frames, RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    return (await off.startRendering()).getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

/** Склейка текстов кусков: пробел между ними, отметки времени сдвигаются на начало куска. */
export type Seg = { start: number; end: number; text: string };
export function shiftSegments(segments: Seg[], offsetSec: number): Seg[] {
  return segments.map((s) => ({ start: s.start + offsetSec, end: s.end + offsetSec, text: s.text }));
}

export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(s % 60).padStart(2, "0")}`;
};
