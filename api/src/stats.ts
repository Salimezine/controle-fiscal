// Calcul du temps de traitement à partir des horodatages internes.
// Format D1 : "YYYY-MM-DD HH:MM:SS" (UTC, sans fuseau).
export function timestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value.replace(' ', 'T') + 'Z');
  return Number.isFinite(ms) ? ms : null;
}

// Durée écoulée entre la création du dossier et sa dernière activité, en minutes.
// Une dossier sans activité posterior compte 0 minute (il n'a pas encore été traité).
export function minutesBetween(start: unknown, end: unknown): number {
  const a = timestampMs(start);
  const b = timestampMs(end);
  if (a === null || b === null || b <= a) return 0;
  return Math.max(0, Math.round((b - a) / 60000));
}

export function heures(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}
