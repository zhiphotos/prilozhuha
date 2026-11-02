import { decideOpenCopy, decideSync, splitParts } from "./sync-logic.ts";
import { mergeBooks, type MergeReport } from "./sync-merge.ts";

// Ядро синхронизации без браузерных зависимостей: всё внешнее (сеть, хранилище, книга, резервные копии) передаётся снаружи.
// Поэтому те же самые функции работают и в приложении, и в тестах против настоящего серверного кода.

export const PART = 700_000;

export type Meta = { rev: number; hash: string; at: string };
export type Reply = { status: number; data: Record<string, unknown> & { error?: string } };
export type Snapshot = { text: string; hash: string; refs: string[] };

export type Deps = {
  call: (body: Record<string, unknown>) => Promise<Reply>;
  snapshot: () => Snapshot;
  readMeta: () => Meta;
  writeMeta: (meta: Meta) => void;
  /** Книга на этом устройстве пуста (новое устройство). */
  isEmpty: () => boolean;
  uploadMedia: (refs: string[]) => Promise<void>;
  downloadMedia: (refs: string[]) => Promise<void>;
  collectRefs: (data: Record<string, unknown>) => string[];
  /** Заменяет книгу на устройстве данными из облака или копии. */
  applyBook: (data: Record<string, unknown>) => void;
  saveBackup: (label: string, text: string, protect?: string) => Promise<string>;
  readBackup: (key: string) => Promise<Record<string, unknown> | null>;
  now: () => string;
};

export type SyncMode = "auto" | "mine" | "cloud" | "merge";
export type SyncOutcome =
  | { kind: "uploaded"; rev: number }
  | { kind: "downloaded"; rev: number }
  | { kind: "merged"; rev: number; report: MergeReport }
  | { kind: "same" }
  | { kind: "conflict"; reason: "both-changed" | "cloud-moved" }
  | { kind: "error"; message: string };

export async function pack(text: string): Promise<string> {
  if (typeof CompressionStream === "undefined") return `r:${text}`;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
  return `g:${btoa(binary)}`;
}

export async function unpack(packed: string): Promise<string> {
  if (packed.startsWith("r:")) return packed.slice(2);
  const binary = atob(packed.slice(2));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
}

const num = (value: unknown) => (typeof value === "number" ? value : Number(value ?? 0));
const fail = (reply: Reply, fallback: string) => new Error(String(reply.data.error || fallback));

/** Часть облачной копии не нашлась на сервере (срок хранения мог истечь): облако нечитаемо, а книга на устройстве цела. */
export class CloudPartMissing extends Error {
  constructor() {
    super("В облаке не хватает части книги: срок хранения мог истечь. Книга на этом устройстве не тронута.");
  }
}

/** Облачная версия целиком (текст книги). Скачивает все части и только потом отдаёт результат: обрыв посередине ничего не меняет. */
export async function cloudText(deps: Deps, rev: number, parts: number): Promise<string> {
  let packed = "";
  for (let i = 0; i < parts; i += 1) {
    const got = await deps.call({ op: "part", rev, i });
    if (got.status === 404) throw new CloudPartMissing();
    if (got.status !== 200 || got.data.data == null) throw fail(got, "Не получилось прочитать облачную версию.");
    packed += String(got.data.data);
  }
  return unpack(packed);
}

/** Версия принята облаком, только если сервер подтвердил «committed» и потом показал ту же версию и тот же отпечаток (старый сервер отпечаток не возвращает: тогда проверяем только номер). */
async function upload(deps: Deps, cloudRev: number): Promise<{ ok: true; rev: number } | { ok: false }> {
  const snap = deps.snapshot();
  await deps.uploadMedia(snap.refs);
  const parts = splitParts(await pack(snap.text), PART);
  let committedRev = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const sent = await deps.call({ op: "push", baseRev: cloudRev, parts: parts.length, i, data: parts[i], hash: snap.hash });
    if (sent.status === 409) {
      // Возможно, версия уже принята, а ответ потерялся: тогда в облаке именно наша книга.
      const head = await deps.call({ op: "head" });
      if (head.status === 200 && head.data.hash && head.data.hash === snap.hash) {
        const rev = num(head.data.rev) || cloudRev + 1;
        deps.writeMeta({ rev, hash: snap.hash, at: deps.now() });
        return { ok: true, rev };
      }
      return { ok: false };
    }
    if (sent.status !== 200) throw fail(sent, "Книга не загрузилась.");
    if (sent.data.committed) committedRev = num(sent.data.rev) || cloudRev + 1;
  }
  if (!committedRev) throw new Error("Облако не подтвердило сохранение. Изменения остались на этом устройстве, попробуйте ещё раз.");
  const check = await deps.call({ op: "head" });
  const hashBad = typeof check.data.hash === "string" && check.data.hash !== snap.hash;
  if (check.status !== 200 || num(check.data.rev) !== committedRev || hashBad) throw new Error("Не удалось убедиться, что книга сохранилась в облаке. Изменения остались на этом устройстве.");
  deps.writeMeta({ rev: committedRev, hash: snap.hash, at: deps.now() });
  return { ok: true, rev: committedRev };
}

/** Берёт книгу из облака: сначала всё скачивает и проверяет, и только потом заменяет книгу на устройстве. */
async function download(deps: Deps, rev: number, parts: number, backupLocal: boolean) {
  const data = JSON.parse(await cloudText(deps, rev, parts)) as Record<string, unknown>;
  if (!Array.isArray(data.people) || !Array.isArray(data.pages)) throw new Error("Облачная версия повреждена, книга на этом устройстве не тронута.");
  await deps.downloadMedia(deps.collectRefs(data));
  if (backupLocal) await deps.saveBackup("Книга на этом устройстве до замены облачной", deps.snapshot().text);
  deps.applyBook(data);
  deps.writeMeta({ rev, hash: deps.snapshot().hash, at: deps.now() });
}

/** Обе версии как данные: облачная скачивается целиком и проверяется, версия этого устройства берётся из снимка. */
async function bothVersions(deps: Deps, cloudRev: number, parts: number) {
  const cloudData = JSON.parse(await cloudText(deps, cloudRev, parts)) as Record<string, unknown>;
  if (!Array.isArray(cloudData.people) || !Array.isArray(cloudData.pages)) throw new Error("Облачная версия повреждена, книга на этом устройстве не тронута.");
  const snap = deps.snapshot();
  return { cloudData, localText: snap.text, localData: JSON.parse(snap.text) as Record<string, unknown> };
}

/** Что даст объединение: сколько записей добавится из облака и сколько записей отличаются (останутся версии этого устройства). Ничего не меняет. */
export async function previewMerge(deps: Deps): Promise<{ ok: true; report: MergeReport } | { ok: false; message: string }> {
  try {
    const head = await deps.call({ op: "head" });
    if (head.status !== 200) throw fail(head, "Облако не ответило.");
    const { cloudData, localData } = await bothVersions(deps, num(head.data.rev), num(head.data.parts) || 1);
    return { ok: true, report: mergeBooks(localData, cloudData).report };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Не получилось сравнить версии." };
  }
}

/**
 * «Объединить» при конфликте: обе версии сначала сохраняются копиями на этом устройстве, облачные фото докачиваются,
 * потом объединённая книга заменяет книгу на устройстве и уходит в облако новой версией. Если что-то по дороге не вышло,
 * объединённая книга остаётся на устройстве (ничего не потеряно), облако не меняется, а следующая синхронизация снова предложит выбор.
 */
async function mergeFlow(deps: Deps, cloudRev: number, parts: number): Promise<SyncOutcome> {
  const { cloudData, localText, localData } = await bothVersions(deps, cloudRev, parts);
  const { data, report } = mergeBooks(localData, cloudData);
  await deps.downloadMedia(deps.collectRefs(cloudData));
  await deps.saveBackup("Книга на этом устройстве до объединения", localText);
  await deps.saveBackup("Облачная книга до объединения", JSON.stringify(cloudData));
  deps.applyBook(data);
  const result = await upload(deps, cloudRev);
  return result.ok ? { kind: "merged", rev: result.rev, report } : { kind: "conflict", reason: "cloud-moved" };
}

/** Одна синхронизация. auto: только безопасные случаи; при конфликте ничего не меняет. mine/cloud: выбор человека при конфликте. */
export async function syncCore(deps: Deps, mode: SyncMode = "auto"): Promise<SyncOutcome> {
  try {
    const head = await deps.call({ op: "head" });
    if (head.status !== 200) throw fail(head, "Облако не ответило.");
    const cloudRev = num(head.data.rev);
    const parts = num(head.data.parts) || 1;
    const meta = deps.readMeta();
    // Пустая книга на новом устройстве ничего не меняла: берём облако без вопросов.
    const snap = deps.snapshot();
    // В облаке уже лежит ровно эта книга (запись прошла, а ответ потерялся): принимаем облачную версию как свою, конфликта нет.
    if (cloudRev > 0 && head.data.hash && head.data.hash === snap.hash) {
      deps.writeMeta({ rev: cloudRev, hash: snap.hash, at: deps.now() });
      return { kind: "same" };
    }
    const dirty = meta.rev === 0 && deps.isEmpty() ? false : snap.hash !== meta.hash;
    let todo = decideSync({ cloudRev, baseRev: meta.rev, dirty });
    if (todo === "conflict" && mode === "mine") todo = "upload";
    if (todo === "conflict" && mode === "cloud") todo = "download";
    if (todo === "conflict" && mode === "merge") return await mergeFlow(deps, cloudRev, parts);
    if (todo === "conflict") return { kind: "conflict", reason: "both-changed" };
    if (todo === "upload") {
      // «Оставить мою»: облачная версия будет заменена, поэтому сначала сохраняем её копию на этом устройстве.
      if (cloudRev > 0 && dirty && meta.rev !== cloudRev) {
        try {
          await deps.saveBackup("Облачная книга до замены", await cloudText(deps, cloudRev, parts));
        } catch (error) {
          // Облако уже нечитаемо (частей нет на сервере): копировать нечего, и человек сам выбрал «оставить с этого устройства».
          // Любая другая ошибка (сеть, нет места для копии) по-прежнему останавливает замену.
          if (!(error instanceof CloudPartMissing)) throw error;
        }
      }
      const result = await upload(deps, cloudRev);
      return result.ok ? { kind: "uploaded", rev: result.rev } : { kind: "conflict", reason: "cloud-moved" };
    }
    if (todo === "download") {
      await download(deps, cloudRev, parts, dirty);
      return { kind: "downloaded", rev: cloudRev };
    }
    deps.writeMeta({ ...meta, at: deps.now() });
    return { kind: "same" };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Не получилось синхронизировать." };
  }
}

/**
 * После «Открыть копию»: копия станет книгой в облаке только если в облаке нет версии, которой это устройство не видело.
 * Иначе облако не трогаем, показываем выбор: старая копия не должна молча затирать новую облачную книгу.
 */
export async function afterOpenCopy(deps: Deps): Promise<SyncOutcome> {
  try {
    const head = await deps.call({ op: "head" });
    if (head.status !== 200) throw fail(head, "Облако не ответило.");
    const meta = deps.readMeta();
    const cloudRev = num(head.data.rev);
    deps.writeMeta({ rev: decideOpenCopy({ cloudRev, baseRev: meta.rev }) === "upload" ? cloudRev : meta.rev, hash: "", at: meta.at });
    return await syncCore(deps, "auto");
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Не получилось синхронизировать." };
  }
}

/**
 * Возврат на предыдущую облачную версию: она берётся на это устройство (текущая книга сохраняется в резервную копию)
 * и при следующей синхронизации уходит в облако как НОВАЯ версия, поэтому другие устройства подтянут её штатным путём.
 */
export async function restorePreviousCloud(deps: Deps): Promise<SyncOutcome> {
  try {
    const head = await deps.call({ op: "head" });
    if (head.status !== 200) throw fail(head, "Облако не ответило.");
    const prevRev = num(head.data.prevRev);
    const prevParts = num(head.data.prevParts);
    if (prevRev < 1 || prevParts < 1) throw new Error("Предыдущей версии в облаке нет.");
    const data = JSON.parse(await cloudText(deps, prevRev, prevParts)) as Record<string, unknown>;
    if (!Array.isArray(data.people) || !Array.isArray(data.pages)) throw new Error("Предыдущая версия повреждена, книга не тронута.");
    await deps.downloadMedia(deps.collectRefs(data));
    await deps.saveBackup("Книга до возврата к предыдущей облачной версии", deps.snapshot().text);
    deps.applyBook(data);
    deps.writeMeta({ rev: num(head.data.rev), hash: "", at: deps.readMeta().at });
    return await syncCore(deps, "auto");
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : "Не получилось вернуть предыдущую версию." };
  }
}

/** Вернуть книгу из резервной копии на этом устройстве. Текущая книга перед этим сохраняется отдельной копией, а восстанавливаемая копия при этом не удаляется. */
export async function restoreLocalBackup(deps: Deps, key: string): Promise<boolean> {
  const data = await deps.readBackup(key);
  if (!data || !Array.isArray(data.people) || !Array.isArray(data.pages)) return false;
  await deps.saveBackup("Книга до восстановления из копии", deps.snapshot().text, key);
  deps.applyBook(data);
  deps.writeMeta({ ...deps.readMeta(), hash: "" }); // восстановленная версия считается правкой и дальше решается обычной синхронизацией
  return true;
}
