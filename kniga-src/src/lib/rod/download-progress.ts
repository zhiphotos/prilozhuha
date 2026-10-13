/** Общий процент скачивания модели: у модели несколько файлов, и каждый сообщает свои проценты.
 *  Складываем скачанное по всем файлам и никогда не показываем число меньше уже показанного. */
type Update = { status?: string; file?: string; loaded?: number; total?: number; progress?: number };

export function downloadProgress(format: (percent: number) => string, emit: (label: string) => void): (update: Update) => void {
  const files = new Map<string, { loaded: number; total: number }>();
  let shown = 0;
  return (update) => {
    if (update.status !== "progress") return;
    const total = update.total ?? 0;
    const loaded = update.loaded ?? ((update.progress ?? 0) / 100) * total;
    files.set(update.file ?? "file", { loaded, total });
    let sumLoaded = 0;
    let sumTotal = 0;
    files.forEach((item) => {
      sumLoaded += item.loaded;
      sumTotal += item.total;
    });
    const percent = sumTotal > 0 ? Math.min(99, Math.round((sumLoaded / sumTotal) * 100)) : Math.round(update.progress ?? 0);
    if (percent > shown) {
      shown = percent;
      emit(format(percent));
    }
  };
}
