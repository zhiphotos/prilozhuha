import { saveMedia } from "@/lib/rod/media";

// Для печати 18×24 см при 300 dpi нужно ~2100 px по длинной стороне.
const PRINT_MAX = 2100;

function decode(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Этот снимок не открылся. Выберите JPG или PNG."));
    };
    image.src = url;
  });
}

function hasAlpha(context: CanvasRenderingContext2D, width: number, height: number): boolean {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 40));
  const { data } = context.getImageData(0, 0, width, height);
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] < 250) return true;
    }
  }
  return false;
}

/** Уменьшает до печатного размера и кладёт в хранилище. Возвращает ссылку "media:…". */
export async function importImage(source: Blob): Promise<string> {
  const image = await decode(source);
  const scale = Math.min(1, PRINT_MAX / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Не удалось прочитать снимок");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const png = source.type === "image/png" && hasAlpha(context, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, png ? "image/png" : "image/jpeg", png ? undefined : 0.86),
  );
  if (!blob) throw new Error("Не удалось сохранить снимок");
  return saveMedia(blob);
}

/** Картинка по адресу из интернета (перетащили из Pinterest или вставили ссылку). */
export async function importImageUrl(url: string): Promise<string> {
  // Pinterest не разрешает сайтам скачивать свои картинки напрямую, поэтому второй заход — через открытый прокси картинок.
  const direct = await fetch(url, { mode: "cors" }).catch(() => null);
  const res =
    direct && direct.ok
      ? direct
      : await fetch(`https://wsrv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}`, { mode: "cors" });
  if (!res.ok) throw new Error("Картинка не скачалась");
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) throw new Error("По ссылке не картинка");
  return importImage(blob);
}

/** Достаёт картинку из перетаскивания или вставки: файл, ссылку или кусок HTML с <img>. */
export async function imageFromTransfer(data: DataTransfer | null): Promise<string | null> {
  if (!data) return null;
  const file = [...data.files].find((item) => item.type.startsWith("image/"));
  if (file) return importImage(file);
  for (const item of [...data.items]) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) return importImage(blob);
    }
  }
  const html = data.getData("text/html");
  const fromHtml = html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  const uri = fromHtml || data.getData("text/uri-list") || data.getData("text/plain");
  const link = uri.split(/\s+/).find((item) => /^https?:\/\//.test(item));
  if (!link) return null;
  const big = upgradePin(link);
  if (big === link) return importImageUrl(link);
  return importImageUrl(big).catch(() => importImageUrl(link));
}

/** У Pinterest в ленте маленькие превью — просим оригинал. */
export function upgradePin(url: string): string {
  return url.replace(/i\.pinimg\.com\/\d+x(\d+)?\//, "i.pinimg.com/originals/");
}
