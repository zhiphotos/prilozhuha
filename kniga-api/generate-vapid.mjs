// Один раз: создаёт пару ключей для пуш-уведомлений. Публичный и приватный ключ вписать в Vercel (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY).
import webpush from "web-push";
const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
