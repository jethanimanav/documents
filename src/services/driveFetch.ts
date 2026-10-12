import { authService } from './auth';

/**
 * Calculates exponential backoff with jitter.
 */
async function waitBackoff(attempt: number, retryAfterHeader?: string | null): Promise<void> {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(seconds * 1000, 10000)));
      return;
    }
  }
  // Exponential backoff: base 300ms * 2^attempt + jitter (0-150ms)
  const baseMs = 300 * Math.pow(2, attempt);
  const jitter = Math.random() * 150;
  const delay = Math.min(6000, baseMs + jitter);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Wraps all Google Drive REST API calls.
 * - Injects the in-memory Authorization bearer token.
 * - Retries on HTTP 429 (rate limits) and HTTP 5xx (server errors) with exponential backoff & jitter (up to 3 attempts).
 * - On 401, marks authentication as expired, pauses the request, and triggers
 *   the persistent "Reconnect Google" prompt.
 * - When the user completes re-connection, retries the request automatically.
 */
export async function driveFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  let attempt = 0;

  while (true) {
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

      const retryResponse = await fetch(input, {
        ...init,
        headers: retryHeaders,
      });

      if (retryResponse.status === 401) {
        authService.markNeedsReconnect();
      }

      return retryResponse;
    }

    // Rate limits (429) & Server Errors (5xx) with exponential backoff & jitter
    if (
      (response.status === 429 || (response.status >= 500 && response.status <= 599)) &&
      attempt < maxRetries
    ) {
      console.warn(
        `Google Drive API returned HTTP ${response.status}. Retrying (attempt ${attempt + 1}/${maxRetries})...`
      );
      await waitBackoff(attempt, response.headers.get('Retry-After'));
      attempt++;
      continue;
    }

    return response;
  }
}
