/**
 * Compare platform log IP with the CRM viewer IP (same request path as the gestionnaire
 * loading the logs). Used to heuristically label activity as conseiller vs client.
 */
export function normalizeIpForCompare(ip: string | null | undefined): string {
  if (!ip) return '';
  let t = ip.trim().toLowerCase();
  if (!t || t === 'unknown') return '';
  if (t.startsWith('::ffff:')) {
    // Trim again: outer trim does not remove space after the prefix (e.g. "::ffff:  1.2.3.4").
    t = t.slice(7).trim();
  }
  return t;
}

export type PlatformLogActorKind = 'gestionnaire' | 'client' | 'unknown';

export function getPlatformLogActorKind(
  logIp: string | null | undefined,
  viewerIp: string | null | undefined
): PlatformLogActorKind {
  const a = normalizeIpForCompare(logIp);
  const b = normalizeIpForCompare(viewerIp);
  if (!a || !b) return 'unknown';
  if (a === b) return 'gestionnaire';
  return 'client';
}

export function getPlatformLogOriginPresentation(kind: PlatformLogActorKind): {
  label: string;
  className: string;
  rowClassName: string;
} {
  switch (kind) {
    case 'gestionnaire':
      return {
        label: 'Conseiller',
        className: 'platform-log-origin-badge platform-log-origin-badge--conseiller',
        rowClassName: 'platform-log-origin-row--conseiller',
      };
    case 'client':
      return {
        label: 'Client',
        className: 'platform-log-origin-badge platform-log-origin-badge--client',
        rowClassName: 'platform-log-origin-row--client',
      };
    default:
      return {
        label: 'Indéterminé',
        className: 'platform-log-origin-badge platform-log-origin-badge--unknown',
        rowClassName: '',
      };
  }
}
