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

export function addProjectMeta(name: string): ProjectMeta {
  const meta: ProjectMeta = { id: crypto.randomUUID().slice(0, 8), name: name.trim() || "Новая книга", createdAt: new Date().toISOString() };
  write(LIST_KEY, [...listProjects(), meta]);
  return meta;
}

export function renameProjectMeta(id: string, name: string) {
  write(LIST_KEY, listProjects().map((item) => (item.id === id ? { ...item, name: name.trim() || item.name } : item)));
}

export function removeProjectMeta(id: string) {
  write(LIST_KEY, listProjects().filter((item) => item.id !== id));
}
