import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '../auth';
import { driveFetch } from '../driveFetch';

describe('AuthService and driveFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authService.signOut();
  });

  it('keeps tokens in memory and marks unauthenticated initially', () => {
    const state = authService.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.needsReconnect).toBe(false);
  });

  it('pauses driveFetch when token is missing and triggers needsReconnect', async () => {
    let fetchCalled = false;
    // Mock global fetch
    globalThis.fetch = vi.fn().mockImplementation(async (_url: any, _init: any) => {
      fetchCalled = true;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    // Start driveFetch without token - this should pause
    const fetchPromise = driveFetch('https://www.googleapis.com/drive/v3/files');

    // authService should now require reconnect
    const state = authService.getState();
    expect(state.needsReconnect).toBe(true);
    expect(fetchCalled).toBe(false);

    // Simulate user tapping Reconnect and token received
    (authService as any).setAccessToken('mock-token-xyz', 3600);

    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://www.googleapis.com/drive/v3/files',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
  });

  it('intercepts 401 response in driveFetch, flags reconnect, and retries with fresh token', async () => {
    // Start with a mock token
    (authService as any).setAccessToken('old-expired-token', 3600);
    expect(authService.getState().isAuthenticated).toBe(true);

    let driveFilesCalls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('drive/v3/about')) {
        return new Response(JSON.stringify({ user: { displayName: 'Test User' } }), { status: 200 });
      }

      driveFilesCalls++;
      const headers = new Headers(init?.headers);
      const authHeader = headers.get('Authorization');

      if (driveFilesCalls === 1) {
        expect(authHeader).toBe('Bearer old-expired-token');
        return new Response('Unauthorized', { status: 401 });
      }

      expect(authHeader).toBe('Bearer fresh-refreshed-token');
      return new Response(JSON.stringify({ files: [] }), { status: 200 });
    });

    const fetchPromise = driveFetch('https://www.googleapis.com/drive/v3/files');

    // Yield execution to allow the first fetch promise to execute and return 401
    await new Promise((r) => setTimeout(r, 10));

    expect(authService.getState().needsReconnect).toBe(true);
    expect(authService.getState().isAuthenticated).toBe(false);

    // Now simulate user tapping Reconnect
    (authService as any).setAccessToken('fresh-refreshed-token', 3600);

    const result = await fetchPromise;
    expect(result.status).toBe(200);
    expect(driveFilesCalls).toBe(2);
  });
});
