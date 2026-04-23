/**
 * Affichage des dates d'ouverture / fermeture de positions : fuseau fixe
 * (pas l'heure locale du device). Ajustez {@link POSITION_DISPLAY_TIMEZONE} si besoin (ex. UTC).
 */
export const POSITION_DISPLAY_TIMEZONE = 'Europe/Paris';

const withZone = (overrides: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => ({
  timeZone: POSITION_DISPLAY_TIMEZONE,
  ...overrides,
});

export function formatPositionDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(
    'fr-FR',
    withZone({
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  ).format(d);
}

/** Période « mois seulement » / fallback sans heure, même zone que l’ouverture. */
export function formatPositionDateOnly(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(
    'fr-FR',
    withZone({
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  ).format(d);
}
