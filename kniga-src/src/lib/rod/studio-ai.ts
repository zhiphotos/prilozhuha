import { createServerFn } from "@tanstack/react-start";

type GrokMessage = {
  role: "system" | "user";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

async function grok(messages: GrokMessage[], maxTokens: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { ok: false, error: "Сейчас распознавание недоступно. Текст можно вписать самим." };
  let res: Response;
  try {
    res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.4,
        max_tokens: maxTokens,
        messages,
      }),
    });
  } catch {
    return { ok: false, error: "Не удалось достучаться до распознавания. Попробуйте ещё раз." };
  }
  if (!res.ok) return { ok: false, error: "Распознавание сейчас занято. Можно вписать текст вручную." };
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) return { ok: false, error: "Пустой ответ. Напишите строку сами — она встанет выбранным шрифтом." };
  return { ok: true, text };
}

export const readHandwriting = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const image = typeof input === "object" && input && "image" in input ? String((input as { image: unknown }).image) : "";
    return { image };
  })
  .handler(async ({ data }) => {
    if (!data.image.startsWith("data:image/") || data.image.length > 1_600_000) {
      return { ok: false as const, error: "Рисунок слишком большой или пустой." };
    }
    const result = await grok(
      [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Это рукописная заметка для семейной книги, чаще по-русски. Верни только распознанный текст, без пояснений. Сохрани смысл и переносы строк. Если букв нет, верни пустую строку.",
            },
            { type: "image_url", image_url: { url: data.image } },
          ],
        },
      ],
      220,
    );
    return result;
  });

export const composeMemory = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const source = input as { title?: unknown; notes?: unknown };
    return {
      title: String(source.title ?? "").slice(0, 180),
      notes: String(source.notes ?? "").slice(0, 5000),
    };
  })
  .handler(async ({ data }) => {
    if (data.notes.trim().length < 8) return { ok: false as const, error: "Сначала ответьте хотя бы на один вопрос." };
    return grok(
      [
        {
          role: "system",
          content:
            "Ты помогаешь собрать страницу семейной книги. Пиши по-русски, тепло, от первого лица того, кто отвечал. 2–4 коротких абзаца. Не выдумывай факты, даты и имена, которых нет в ответах. Не упоминай, что ты модель. Без заголовка и без списков.",
        },
        {
          role: "user",
          content: `Страница: ${data.title}\n\nОтветы:\n${data.notes}`,
        },
      ],
      520,
    );
  });

export const storiesFromTalk = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const source = input as { transcript?: unknown };
    return { transcript: String(source.transcript ?? "").slice(0, 8000) };
  })
  .handler(async ({ data }) => {
    if (data.transcript.trim().length < 20) {
      return { ok: false as const, error: "Слишком короткая запись. Нужна хотя бы пара живых фраз.", pages: [] as { title: string; text: string }[] };
    }
    const result = await grok(
      [
        {
          role: "system",
          content:
            "Из расшифровки семейного разговора выдели до 4 коротких историй для книги рода. Не выдумывай. Верни только JSON вида {\"pages\":[{\"title\":\"\",\"text\":\"\"}]}. text — 2–5 предложений от первого лица слушателя.",
        },
        { role: "user", content: data.transcript },
      ],
      800,
    );
    if (!result.ok) return { ok: false as const, error: result.error, pages: [] as { title: string; text: string }[] };
    const pages = parsePages(result.text);
    if (pages.length === 0) return { ok: false as const, error: "Не удалось собрать страницы из этого разговора.", pages };
    return { ok: true as const, pages };
  });

function parsePages(text: string): { title: string; text: string }[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { pages?: { title?: unknown; text?: unknown }[] };
    return (parsed.pages ?? [])
      .map((page) => ({ title: String(page.title ?? "").trim(), text: String(page.text ?? "").trim() }))
      .filter((page) => page.title && page.text)
      .slice(0, 4);
  } catch {
    return [];
  }
}
