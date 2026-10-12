// Что делаем после того, как книга прочитана из хранилища: чиним старые страницы, подключаем свои шрифты.
import { registerFont } from "@/lib/rod/fonts";
import { migrateCover, migratePage } from "@/lib/rod/layouts";
import { openProject } from "@/lib/rod/store";
import { useRod } from "@/lib/rod/store";

export function afterHydrate(): void {
  useRod.setState((state) => ({
    pages: state.pages.map((page) => migrateCover(migratePage(page), { dedicatee: state.dedicatee, collector: state.collector })),
    back: state.back ? migratePage(state.back) : state.back,
    trash: state.trash.map((item) => ({ ...item, page: migratePage(item.page) })),
  }));
  for (const font of useRod.getState().fonts ?? []) void registerFont(font);
}

/** Открыть другую книгу (или новую) и привести её в порядок. */
export async function switchBook(id: string, seed?: Parameters<typeof openProject>[1]): Promise<void> {
  await openProject(id, seed);
  afterHydrate();
}
