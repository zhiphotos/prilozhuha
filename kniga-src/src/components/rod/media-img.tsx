import { useMedia } from "@/lib/rod/media";

/** <img>, который понимает ссылки на фото из хранилища книги. */
export function MediaImg({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const url = useMedia(src);
  if (!url) return <div className={className} style={{ background: "rgba(42,36,32,0.06)" }} />;
  return <img src={url} alt={alt} className={className} />;
}
