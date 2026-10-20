import { alfaConfigured } from "../alfa.js";
import { cors, json } from "../config.js";
import { pushConfigured } from "../push.js";
import { redisConfigured } from "../redis.js";

// GET /api/status – что на сервере уже подключено. Приложение по этому решает, какие кнопки показывать.
export default async function handler(req, res) {
  if (cors(req, res)) return;
  return json(res, 200, { pay: alfaConfigured(), push: pushConfigured() && redisConfigured(), rooms: redisConfigured(), ai: Boolean(process.env.AI_API_KEY) });
}
