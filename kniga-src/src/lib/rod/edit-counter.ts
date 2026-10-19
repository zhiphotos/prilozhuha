// Сколько правок страниц сделано с последней копии книги. Нужно, чтобы напоминать о копии редко и по делу.
const KEY = "kniga-edits-since-backup";
const SHOWN = "kniga-backup-reminded";
export const REMIND_AFTER_EDITS = 20;
const QUIET_MS = 6 * 3600000; // не чаще раза в 6 часов

const read = (key: string): number => {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
};
const write = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* без счётчика напоминания просто реже */
  }
};

// Набор текста и ведение пера дают десятки мелких правок подряд: считаем не чаще раза в 8 секунд, то есть примерно «одно действие».
let lastNote = 0;
export const noteEdit = () => {
  const now = Date.now();
  if (now - lastNote < 8000) return;
  lastNote = now;
  write(KEY, read(KEY) + 1);
};
export const resetEdits = () => write(KEY, 0);
export const editsSinceBackup = () => read(KEY);
export const shouldRemind = (): boolean => editsSinceBackup() >= REMIND_AFTER_EDITS && Date.now() - read(SHOWN) > QUIET_MS;
export const markReminded = () => write(SHOWN, Date.now());
