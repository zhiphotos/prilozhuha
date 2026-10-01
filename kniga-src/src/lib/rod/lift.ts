/** Cut a subject out of a photo. The model runs only in the browser. */
export async function liftSubject(dataUrl: string, onProgress?: (label: string) => void): Promise<string | null> {
  if (import.meta.env.SSR) return null;
  // На телефоне нейросеть (~70 МБ в памяти) может перезагрузить вкладку — там только быстрая вырезка по фону.
  if (isPhone()) {
    onProgress?.("Вырезаю…");
    const { layAsSticker } = await import("./sticker");
    return layAsSticker(dataUrl).catch(() => null);
  }
  const { liftOnClient } = await import("./lift.client");
  return liftOnClient(dataUrl, onProgress);
}

function isPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent) || Math.min(window.screen.width, window.screen.height) < 600;
}
