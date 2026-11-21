/**
 * Открытие копии из файла. Порядок обязателен:
 * 1) копия текущей книги; не сохранилась: файл не открывается, книга и метка остаются прежними;
 * 2) импорт (он сам ничего не меняет, пока не проверил файл целиком);
 * 3) только после успешного импорта сбрасывается метка синхронизации (ошибка сброса не отменяет уже открытую копию).
 */
export const OPEN_COPY_BACKUP_FAILED = "Копия текущей книги не сохранилась (возможно, не хватает места), поэтому файл не открыт. Книга не заменена.";

export async function openCopyFlow(deps: { backup: () => Promise<unknown>; importFile: () => Promise<void>; markImported: () => Promise<unknown> }): Promise<void> {
  try {
    await deps.backup();
  } catch {
    throw new Error(OPEN_COPY_BACKUP_FAILED);
  }
  await deps.importFile();
  void Promise.resolve(deps.markImported()).catch(() => undefined);
}
