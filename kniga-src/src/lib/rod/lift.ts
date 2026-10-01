/** Cut a subject out of a photo. The model runs only in the browser. */
export async function liftSubject(dataUrl: string, onProgress?: (label: string) => void): Promise<string | null> {
  if (import.meta.env.SSR) return null;
  const { liftOnClient } = await import("./lift.client");
  return liftOnClient(dataUrl, onProgress);
}
