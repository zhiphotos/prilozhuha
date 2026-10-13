import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope/index.css";
import { RodApp } from "@/components/rod/app";
import "../src/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RodApp />
  </StrictMode>,
);
