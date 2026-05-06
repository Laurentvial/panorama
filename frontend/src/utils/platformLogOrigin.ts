/**
 * Resolve actor kind from server-issued connection origin only.
 */

export type PlatformLogActorKind = 'gestionnaire' | 'client' | 'unknown';

function normalizeOrigin(origin: string | null | undefined): string {
  return String(origin || '').trim().toLowerCase();
}

export function getPlatformLogActorKind(
  logOrigin: string | null | undefined,
  _logIp?: string | null,
  _viewerIp?: string | null
): PlatformLogActorKind {
  const normalizedOrigin = normalizeOrigin(logOrigin);
  if (normalizedOrigin === 'crm_impersonation') return 'gestionnaire';
  if (normalizedOrigin === 'client_login' || normalizedOrigin === 'otp_login') return 'client';
  return 'unknown';
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
