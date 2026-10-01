/** Paper, pencil and glue, made in the browser so the book stays quiet offline. */

const KEY = "kniga-roda-sound";

let on = true;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let lastScratch = 0;

function remembered(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

on = remembered();

function audio(): AudioContext | null {
  if (!on || typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function buffer(): AudioBuffer | null {
  const current = audio();
  if (!current) return null;
  if (noise && noise.sampleRate === current.sampleRate) return noise;
  const length = current.sampleRate * 2;
  const data = current.createBuffer(1, length, current.sampleRate);
  const channel = data.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    channel[i] = brown * 3.4;
  }
  noise = data;
  return noise;
}

function burst(peak: number, attack: number, decay: number, fromHz: number, toHz: number, q: number) {
  const current = audio();
  const grain = buffer();
  if (!current || !grain || !master) return;
  const now = current.currentTime;
  const source = current.createBufferSource();
  source.buffer = grain;
  source.loop = true;
  const filter = current.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = q;
  filter.frequency.setValueAtTime(Math.max(fromHz, 40), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(toHz, 40), now + attack + decay);
  const gain = current.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + decay);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(now);
  source.stop(now + attack + decay + 0.02);
}

export function paperSoundsOn(): boolean {
  return on;
}

export function setPaperSounds(next: boolean) {
  on = next;
  try {
    localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    /* private mode */
  }
}

export function scratch(kind: "pen" | "brush" | "erase") {
  const nowMs = performance.now();
  const gap = kind === "brush" ? 36 : 26;
  if (nowMs - lastScratch < gap) return;
  lastScratch = nowMs;
  if (kind === "erase") burst(0.028, 0.01, 0.05, 600, 420, 0.6);
  else if (kind === "brush") burst(0.04, 0.008, 0.07, 900 + Math.random() * 400, 500, 0.45);
  else burst(0.032, 0.004, 0.04, 1600 + Math.random() * 1400, 900 + Math.random() * 400, 1.3);
}

export function stickSound() {
  burst(0.16, 0.006, 0.14, 380, 1400, 0.7);
  const current = audio();
  if (!current || !master) return;
  const now = current.currentTime;
  const thump = current.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(150, now);
  thump.frequency.exponentialRampToValueAtTime(48, now + 0.12);
  const gain = current.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.1, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  thump.connect(gain);
  gain.connect(master);
  thump.start(now);
  thump.stop(now + 0.14);
}

export function turnPage() {
  burst(0.11, 0.07, 0.42, 280, 2200, 0.45);
  if (typeof window === "undefined") return;
  window.setTimeout(() => burst(0.05, 0.02, 0.18, 1400, 700, 0.8), 120);
}
