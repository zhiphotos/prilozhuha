// Подстановка «@/…» → «src/…» для тестов в Node: позволяет запускать настоящие модули приложения (например хранилище книги).
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
export async function resolve(specifier, context, next) {
  if (specifier === "sonner") return next(new URL("./sonner-stub.mjs", import.meta.url).href, context);
  if (specifier.startsWith("@/")) {
    const base = root + specifier.slice(2);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (/\.(ts|tsx|js|mjs)$/.test(candidate) && existsSync(candidate)) return next(pathToFileURL(candidate).href, context);
  }
  return next(specifier, context);
}
