import { cors, json } from "../lib/config.js";
import { pushConfigured } from "../lib/push.js";
import { redisConfigured } from "../lib/redis.js";

// GET /api/push-config  -> { enabled, publicKey }
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const enabled = pushConfigured() && redisConfigured();
  return json(res, 200, { enabled, publicKey: enabled ? process.env.VAPID_PUBLIC_KEY : "" });
}
