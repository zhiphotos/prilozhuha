import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope/index.css";
import "@fontsource/cormorant-garamond/cyrillic-500.css";
import "@fontsource/cormorant-garamond/cyrillic-600.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-600.css";
import "@fontsource/caveat/cyrillic-500.css";
import "@fontsource/caveat/latin-500.css";
import { RodApp } from "@/components/rod/app";
import "../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RodApp />
  </StrictMode>,
);
