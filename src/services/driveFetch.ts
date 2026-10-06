import { authService } from './auth';

/**
 * Wraps all Google Drive REST API calls.
 * - Injects the in-memory Authorization bearer token.
 * - On 401, marks authentication as expired, pauses the request, and triggers
 *   the persistent "Reconnect Google" prompt.
 * - When the user completes re-connection, retries the request automatically.
 */
export async function driveFetch(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  const token = await authService.getOrWaitForToken();

  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(input, {
    ...init,
    headers,
  });

  if (response.status === 401) {
    console.warn('Google Drive API returned 401 Unauthorized. Pausing request for user reconnect...');
    authService.markNeedsReconnect();

    // Wait for user to tap "Reconnect Google" and acquire a fresh token
    const freshToken = await authService.waitForToken();

    const retryHeaders = new Headers(init.headers || {});
    retryHeaders.set('Authorization', `Bearer ${freshToken}`);

    return fetch(input, {
      ...init,
      headers: retryHeaders,
    });
  }

  return response;
}
