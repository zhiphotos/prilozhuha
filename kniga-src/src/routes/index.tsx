import { createFileRoute } from "@tanstack/react-router";
import { RodApp } from "@/components/rod/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <RodApp />;
}
