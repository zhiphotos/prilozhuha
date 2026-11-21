import type { Incoming } from "./family.ts";
import { stableStringify } from "./merge-core.ts";

/**
 * Одинаковые предложения помощника (повторная отправка, повторная выдача после сбоя подтверждения) показываются одной карточкой.
 * Одинаковые = тот же автор (имя и родство) и то же содержимое правок. Любое отличие (другое поле, другое значение, лишняя запись) оставляет предложения раздельными.
 * Подтверждаются потом все серверные записи группы.
 */
export type IncomingGroup = { item: Incoming; ids: string[] };

const sig = (item: Incoming) =>
  stableStringify({
    who: [item.from.name, item.from.relation],
    changes: [...(item.changes ?? [])].sort((a, b) => `${a.key}:${a.id}:${a.kind}`.localeCompare(`${b.key}:${b.id}:${b.kind}`)),
  });

export function groupIncoming(items: Incoming[]): IncomingGroup[] {
  const out: IncomingGroup[] = [];
  const seen = new Map<string, IncomingGroup>();
  for (const item of items) {
    if (item.kind !== "changes" || !item.changes) {
      out.push({ item, ids: [item.id] });
      continue;
    }
    const key = sig(item);
    const group = seen.get(key);
    if (group) group.ids.push(item.id);
    else {
      const created = { item, ids: [item.id] };
      seen.set(key, created);
      out.push(created);
    }
  }
  return out;
}
