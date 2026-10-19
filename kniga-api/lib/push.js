import { createHash } from "node:crypto";
import webpush from "web-push";

// VAPID-ключи: `node generate-vapid.mjs`, значения кладутся в переменные окружения Vercel.
export const pushConfigured = () => Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);

export function setupWebPush() {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:darinazizina@gmail.com", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  return webpush;
}

export const subId = (endpoint) => createHash("sha256").update(String(endpoint)).digest("hex").slice(0, 32);

export const validSubscription = (sub) => Boolean(sub && typeof sub.endpoint === "string" && sub.endpoint.startsWith("https://") && sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string");
