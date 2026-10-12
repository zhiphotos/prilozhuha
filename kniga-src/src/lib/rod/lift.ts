/** Cut a subject out of a photo. The model runs only in the browser. */
export async function liftSubject(dataUrl: string, onProgress?: (label: string) => void, mode: "auto" | "precise" = "auto"): Promise<string | null> {
  if (import.meta.env.SSR) return null;
  const { liftOnClient, LIGHT_MODELS, PRECISE_MODELS } = await import("./lift.client");
  // Большая нейросеть (~70 МБ в памяти) на телефоне может перезагрузить вкладку, поэтому по умолчанию там лёгкая (для людей);
  // «Убрать фон точнее» запускает большую и на телефоне.
  if (isPhone() && mode === "auto") return liftOnClient(dataUrl, onProgress, LIGHT_MODELS);
  return liftOnClient(dataUrl, onProgress, PRECISE_MODELS);
}

function isPhone(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent) || Math.min(window.screen.width, window.screen.height) < 600;
}
