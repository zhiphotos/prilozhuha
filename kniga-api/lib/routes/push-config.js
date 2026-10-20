import { cors, json } from "../config.js";
import { pushConfigured } from "../push.js";
import { redisConfigured } from "../redis.js";

// GET /api/push-config  -> { enabled, publicKey }
export default async function handler(req, res) {
  if (cors(req, res)) return;
  const enabled = pushConfigured() && redisConfigured();
  return json(res, 200, { enabled, publicKey: enabled ? process.env.VAPID_PUBLIC_KEY : "" });
}
