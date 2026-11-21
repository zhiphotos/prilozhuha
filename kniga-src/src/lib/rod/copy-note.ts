/** Подпись копии, которую владелец оставил рядом с оригиналом при слиянии («Обе копией»). Пометка лежит в отдельных полях copyOf и copyLabel, название и имя не меняются. */
export function copyNote(rec: unknown): string | null {
  const r = rec as { copyOf?: unknown; copyLabel?: unknown } | null | undefined;
  if (!r || typeof r.copyOf !== "string" || !r.copyOf) return null;
  const label = typeof r.copyLabel === "string" && r.copyLabel.trim() ? r.copyLabel.trim() : "от помощника";
  return `Копия ${label}`;
}
