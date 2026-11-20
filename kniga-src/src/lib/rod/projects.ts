// Несколько книг: у каждой свой ключ в хранилище. Первая («main») сохраняет старый ключ, поэтому уже начатая книга не пропадает.
export type ProjectMeta = { id: string; name: string; createdAt: string };

const LIST_KEY = "kniga-projects";
const ACTIVE_KEY = "kniga-active-project";
export const MAIN_ID = "main";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* без запоминания */
  }
}

export function listProjects(): ProjectMeta[] {
  if (typeof window === "undefined") return [{ id: MAIN_ID, name: "Моя книга", createdAt: "" }];
  const list = read<ProjectMeta[]>(LIST_KEY, []);
  if (!list.some((item) => item.id === MAIN_ID)) {
    list.unshift({ id: MAIN_ID, name: "Моя книга", createdAt: new Date().toISOString() });
    write(LIST_KEY, list);
  }
  return list;
}

export function activeProjectId(): string {
  if (typeof window === "undefined") return MAIN_ID;
  const id = read<string>(ACTIVE_KEY, MAIN_ID);
  return listProjects().some((item) => item.id === id) ? id : MAIN_ID;
}

export function setActiveProject(id: string) {
  write(ACTIVE_KEY, id);
}

export function storageKeyFor(id: string): string {
  return id === MAIN_ID ? "kniga-roda" : `kniga-roda:${id}`;
}

/**
 * Признак «книга создана на этом устройстве и ни разу не отправлялась в облако». Ставится только при создании новой книги
 * здесь и только один раз; любая попытка синхронизации и любой ввод данных из копии или облака его снимают (назад не ставится).
 * Первая книга («main») и книги из облака его не получают: у неё нет достоверного начала, поэтому для неё итог всегда unknown.
 * Отсутствие признака не доказывает ничего, кроме «не знаем».
 */
const LOCAL_ONLY_PREFIX = "kniga-local-only:";
export function isLocalOnly(id: string): boolean {
  try {
    return id !== MAIN_ID && localStorage.getItem(LOCAL_ONLY_PREFIX + id) === "1";
  } catch {
    return false;
  }
}
export function clearLocalOnly(id: string) {
  try {
    localStorage.removeItem(LOCAL_ONLY_PREFIX + id);
  } catch {
    /* признак останется, но синхронизация и ввод данных всё равно прочитают отметки синхронизации */
  }
}

export function addProjectMeta(name: string): ProjectMeta {
  const meta: ProjectMeta = { id: crypto.randomUUID().slice(0, 8), name: name.trim() || "Новая книга", createdAt: new Date().toISOString() };
  write(LIST_KEY, [...listProjects(), meta]);
  try {
    localStorage.setItem(LOCAL_ONLY_PREFIX + meta.id, "1");
  } catch {
    /* без признака итог будет unknown, это безопасно */
  }
  return meta;
}

/** Книга, найденная в облаке на другом устройстве: тот же номер, чтобы обе копии синхронизировались друг с другом. */
export function addProjectWithId(id: string, name: string): ProjectMeta | null {
  if (listProjects().some((item) => item.id === id)) return null;
  const meta: ProjectMeta = { id, name: name.trim() || "Книга из облака", createdAt: new Date().toISOString() };
  write(LIST_KEY, [...listProjects(), meta]);
  return meta;
}

export function renameProjectMeta(id: string, name: string) {
  write(LIST_KEY, listProjects().map((item) => (item.id === id ? { ...item, name: name.trim() || item.name } : item)));
}

export function removeProjectMeta(id: string) {
  clearLocalOnly(id);
  write(LIST_KEY, listProjects().filter((item) => item.id !== id));
}
