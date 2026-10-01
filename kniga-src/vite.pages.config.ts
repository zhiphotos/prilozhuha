// Сборка для GitHub Pages: чистое SPA без сервера, все пути относительные.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    alias: [
      { find: "@/lib/rod/studio-ai", replacement: fileURLToPath(new URL("./spa/studio-ai.static.ts", import.meta.url)) },
      { find: /^@\//, replacement: src + "/" },
    ],
  },
  build: { outDir: process.env.OUT_DIR || "dist-pages", emptyOutDir: true },
});
