export const ACCESS_TOKEN = "access";
export const REFRESH_TOKEN = "refresh";
// Client auth is stored under a separate key so an admin session can coexist.
export const CLIENT_ACCESS_TOKEN = "client_access";
// export const API_URL = "https://panorama-backend.onrender.com/api/";

/** Maps role values to display labels in the UI */
export function formatRoleLabel(role: string | null | undefined): string {
  if (!role) return '';
  const r = role.toLowerCase().trim();
  if (r === 'admin') return 'Admin';
  if (r === 'teamleader') return "Chef d'équipe";
  if (r === 'gestionnaire') return 'Gestionnaire';
  return role;
}