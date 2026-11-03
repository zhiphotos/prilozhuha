import { PROVIDERS, QuotaError } from "./providers.js";
import { aiEnabled } from "./limits.js";
import { downUntil, firstTime, markDown, reserve } from "./quota.js";

const GENEALOGY = `Ты помощник по семейной истории в приложении «Книга рода». Тебе дают данные семейной книги (контекст) и вопрос.
Правила: отвечай по-русски, простыми тёплыми предложениями. Опирайся ТОЛЬКО на контекст. Различай: «подтверждено в книге» и «предположение». Если данных не хватает, прямо скажи, чего не хватает. Не придумывай людей, даты, места, документы и ссылки. Ничего не меняй в книге: только предлагай, что можно уточнить.`;

/** Задачи, которые клиент может запустить. Подсказки (system) живут на сервере: клиент не может превратить ИИ в бесплатный чат. */
export const TASKS = {
  genealogy_ask: { kind: "text", build: ({ question, context }) => ({ system: GENEALOGY, user: `Контекст:\n${String(context ?? "").slice(0, 12000)}\n\nВопрос: ${String(question ?? "").slice(0, 1000)}` }), valid: (i) => String(i.question ?? "").trim().length >= 3 },
};

/** Выполнить задачу: включён ли ИИ, не остановлен ли провайдер, хватает ли квоты, один ли это запрос. Расход возвращается при сбое. */
export async function runTask({ owner, task, input, requestId, env = process.env, now = Date.now() }) {
  const def = Object.hasOwn(TASKS, task) ? TASKS[task] : null;
  if (!def || !def.valid(input ?? {})) return { status: 400, body: { error: "Некорректный запрос." } };
  if (!aiEnabled(env)) return { status: 503, body: { error: "ИИ пока выключен.", code: "disabled" } };
  const provider = PROVIDERS[def.kind];
  if (!provider || !provider.configured(env)) return { status: 503, body: { error: "Эта функция ещё не подключена.", code: "not_configured" } };
  const down = await downUntil(provider.name);
  if (down) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: down } };
  if (!(await firstTime(owner, requestId))) return { status: 409, body: { error: "Этот запрос уже выполняется.", code: "duplicate" } };
  const got = await reserve(owner, def.kind, 1, now, env);
  if (!got.ok) return { status: 429, body: { error: got.scope === "global" ? "Общий дневной запас ИИ закончился." : "Ваш лимит закончился.", code: `${got.scope}_quota`, resetAt: got.resetAt } };
  try {
    const out = await provider.run(def.build(input), env);
    return { status: 200, body: { text: out.text, left: got.left, resetAt: got.resetAt } };
  } catch (error) {
    await got.release();
    if (error instanceof QuotaError) return { status: 429, body: { error: "Бесплатная квота ИИ на сегодня закончилась.", code: "provider_quota", resetAt: await markDown(provider.name, now) } };
    console.error("[ai]", error instanceof Error ? error.message : error);
    return { status: 502, body: { error: "ИИ сейчас не отвечает. Лимит не потрачен." } };
  }
}
