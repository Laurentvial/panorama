import { apiCall } from '../utils/api';

/**
 * Update availability dates for a client asset
 * @param clientId - The client ID
 * @param assetId - The asset ID
 * @param availabilityStart - Start date in YYYY-MM-DD format (or null)
 * @param availabilityEnd - End date in YYYY-MM-DD format (or null)
 * @returns Promise with the updated ClientAsset data
 */
export async function updateClientAssetAvailability(
  clientId: string,
  assetId: string,
  availabilityStart: string | null,
  availabilityEnd: string | null
) {
  return apiCall(`/api/clients/${clientId}/assets/${assetId}/availability/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      availabilityStart, 
      availabilityEnd 
    }),
  });
}

/**
 * Clear availability dates for a client asset (set both to null)
 * @param clientId - The client ID
 * @param assetId - The asset ID
 * @returns Promise with the updated ClientAsset data
 */
export async function clearClientAssetAvailability(
  clientId: string,
  assetId: string
) {
  return updateClientAssetAvailability(clientId, assetId, null, null);
}
