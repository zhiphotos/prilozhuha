import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope/index.css";
import { RodApp } from "@/components/rod/app";
import "../src/styles.css";
import { MOVED_TO } from "@/lib/rod/config";
import { redirectTarget } from "@/lib/rod/move";

// Старый адрес: ссылки-приглашения и просмотра сразу открываются на новом адресе.
const jump = redirectTarget(MOVED_TO, window.location.hash);
if (jump) window.location.replace(jump);

if (!jump) createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RodApp />
  </StrictMode>,
);
