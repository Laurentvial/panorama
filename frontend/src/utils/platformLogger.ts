import { CLIENT_ACCESS_TOKEN, ACCESS_TOKEN } from './constants';
import { getApiBaseUrl } from './apiBaseUrl';

const apiUrl = getApiBaseUrl();

/**
 * Get the current client ID from the token
 */
function getClientId(): string | null {
  if (typeof window === 'undefined') return null;
  
  // Check sessionStorage first (for impersonation)
  const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
  if (sessionToken && sessionToken.startsWith('client_')) {
    return sessionToken.replace('client_', '');
  }
  
  // Check localStorage (for normal client login)
  const clientToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);
  if (clientToken && clientToken.startsWith('client_')) {
    return clientToken.replace('client_', '');
  }
  
  return null;
}

/**
 * Get the current client token for authentication
 */
function getClientToken(): string | null {
  if (typeof window === 'undefined') return null;
  
  // Check sessionStorage first (for impersonation)
  const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
  if (sessionToken && sessionToken.startsWith('client_')) {
    return sessionToken;
  }
  
  // Check localStorage (for normal client login)
  const clientToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);
  if (clientToken && clientToken.startsWith('client_')) {
    return clientToken;
  }
  
  return null;
}

/**
 * Determine current client session origin from storage context.
 * - sessionStorage client token => CRM impersonation session
 * - localStorage client token => direct client login session
 */
function getSessionOrigin(): 'crm_impersonation' | 'client_login' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';

  const sessionToken = sessionStorage.getItem(ACCESS_TOKEN);
  if (sessionToken && sessionToken.startsWith('client_')) {
    return 'crm_impersonation';
  }

  const clientToken = localStorage.getItem(CLIENT_ACCESS_TOKEN);
  if (clientToken && clientToken.startsWith('client_')) {
    return 'client_login';
  }

  return 'unknown';
}

// Debounce map to prevent too many rapid logs
const logDebounceMap = new Map<string, NodeJS.Timeout>();

/**
 * Log a platform action (non-blocking, errors are silently ignored)
 * For logout actions, use logPlatformActionWithCredentials instead to ensure tokens are captured before clearing
 */
export async function logPlatformAction(
  actionType: string,
  actionDetails: Record<string, any> = {}
): Promise<void> {
  try {
    if (actionType === 'login') {
      // Login events are generated server-side only to avoid spoofing/duplicates.
      return Promise.resolve();
    }

    // For page_view, use debouncing to avoid too many logs
    if (actionType === 'page_view') {
      const debounceKey = `page_view_${actionDetails.route || ''}`;
      const existingTimeout = logDebounceMap.get(debounceKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      
      const timeoutId = setTimeout(() => {
        logDebounceMap.delete(debounceKey);
        sendLog(actionType, actionDetails);
      }, 300); // 300ms debounce for page views
      
      logDebounceMap.set(debounceKey, timeoutId);
      return Promise.resolve();
    }
    
    // For other actions, send immediately
    return await sendLog(actionType, actionDetails);
  } catch (error) {
    // Silently ignore errors
    console.debug('Error in logPlatformAction:', error);
    return Promise.resolve();
  }
}

/**
 * Internal function to send the log request
 * Returns a Promise that resolves when the request completes
 */
function sendLog(actionType: string, actionDetails: Record<string, any>): Promise<void> {
  try {
    const clientId = getClientId();
    if (!clientId) {
      // Not a client session, skip logging
      return Promise.resolve();
    }
    
    const token = getClientToken();
    const origin = getSessionOrigin();
    if (!token) {
      // Token not available yet, try again after a short delay
      return new Promise((resolve) => {
        setTimeout(() => {
          const retryClientId = getClientId();
          const retryToken = getClientToken();
          const retryOrigin = getSessionOrigin();
          if (retryClientId && retryToken) {
            sendLogRequest(retryClientId, retryToken, actionType, actionDetails, retryOrigin).then(resolve).catch(() => resolve());
          } else {
            resolve();
          }
        }, 500);
      });
    }
    
    return sendLogRequest(clientId, token, actionType, actionDetails, origin);
  } catch (error) {
    // Silently ignore errors
    console.debug('Error in sendLog:', error);
    return Promise.resolve();
  }
}

/**
 * Log a platform action with pre-captured credentials (for logout scenario)
 * This ensures the log is sent even if tokens are cleared immediately after
 */
export async function logPlatformActionWithCredentials(
  clientId: string,
  token: string,
  actionType: string,
  actionDetails: Record<string, any> = {}
): Promise<void> {
  try {
    return await sendLogRequest(clientId, token, actionType, actionDetails, getSessionOrigin());
  } catch (error) {
    // Silently ignore errors
    console.debug('Error in logPlatformActionWithCredentials:', error);
  }
}

/**
 * Send the actual HTTP request
 * Returns a Promise that resolves when the request completes (or fails silently)
 */
function sendLogRequest(
  clientId: string,
  token: string,
  actionType: string,
  actionDetails: Record<string, any>,
  origin: 'crm_impersonation' | 'client_login' | 'unknown'
): Promise<void> {
  const payloadDetails = {
    ...(actionDetails || {}),
    __sessionOrigin: origin,
  };

  return fetch(`${apiUrl}/api/clients/${clientId}/platform-logs/`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      actionType,
      actionDetails: payloadDetails,
    }),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Failed to log platform action (${response.status})`);
    }
  }).catch((error) => {
    // Silently ignore errors to prevent breaking the UI
    console.debug('Failed to log platform action:', error);
  });
}

/**
 * Batch log multiple actions (for efficiency)
 */
export async function logPlatformActions(
  actions: Array<{ actionType: string; actionDetails?: Record<string, any> }>
): Promise<void> {
  // For now, just log them individually
  // In the future, we could batch them into a single request
  for (const action of actions) {
    await logPlatformAction(action.actionType, action.actionDetails);
  }
}
