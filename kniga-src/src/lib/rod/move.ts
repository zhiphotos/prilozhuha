// Переезд со старого адреса (GitHub Pages) на kniga-balanuca.ru/app/.
// Чистые функции без обращения к окну, чтобы их можно было проверить тестами.

/** Короткие ссылки, которые должны сразу открываться на новом адресе: приглашение помощника, просмотр древа, переход в раздел, ключ доступа. */
const FOLLOW = /^#\/(join\/[0-9a-f]{12}\.[\w-]{6,}|view\/[0-9a-f]{16}|go\/\w+)|[#&]kr-access=/;

/** Адрес нового приложения всегда оканчивается на «/». */
export function movedBase(movedTo: string): string {
  return movedTo.endsWith("/") ? movedTo : `${movedTo}/`;
}

/** Если открыта ссылка-приглашение (или другая «живая» ссылка), возвращает такую же ссылку на новом адресе, иначе null. */
export function redirectTarget(movedTo: string, hash: string): string | null {
  if (!movedTo || !hash || !FOLLOW.test(hash)) return null;
  return `${movedBase(movedTo)}${hash}`;
}

/** Показываемое название адреса: без https:// и без хвостового «/». */
export function movedHost(movedTo: string): string {
  return movedTo.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
