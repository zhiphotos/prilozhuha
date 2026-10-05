// Статическая версия (GitHub Pages): серверного ИИ нет, функции отвечают мягкой ошибкой,
// а в приложении остаётся ручной ввод.
type Pages = { title: string; text: string }[];
const OFF = "В тестовой версии распознавание выключено. Текст можно вписать самим.";

export async function readHandwriting(_: { data: { image: string } }) {
  return { ok: false as const, error: OFF };
}

export async function composeMemory(_: { data: { title: string; notes: string } }) {
  return { ok: false as const, error: OFF };
}

export async function storiesFromTalk(_: { data: { transcript: string } }) {
  return { ok: false as const, error: OFF, pages: [] as Pages };
}
