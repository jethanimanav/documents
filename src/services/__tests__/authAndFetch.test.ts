import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authService } from '../auth';
import { driveFetch } from '../driveFetch';

describe('AuthService and driveFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authService.signOut();
  });

  afterEach(() => {
    delete (globalThis as any).window;
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

  it('uses prompt: "select_account" when calling requestAccessToken to prevent silent failure', async () => {
    const mockRequestAccessToken = vi.fn();
    (authService as any).tokenClient = {
      requestAccessToken: mockRequestAccessToken,
    };
    (authService as any).currentClientId = 'mock-client-id';

    authService.requestToken();

    expect(mockRequestAccessToken).toHaveBeenCalledWith({
      prompt: 'select_account',
    });
  });

  it('preserves pending requests queue when user dismisses the Google popup', async () => {
    // Start a driveFetch that will queue
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const fetchPromise = driveFetch('https://www.googleapis.com/drive/v3/files');
    expect(authService.getState().needsReconnect).toBe(true);

    // Simulate GIS callback with error (e.g. popup_closed_by_user)
    const tokenClientCallback = (authService as any).tokenClient?.callback;
    if (tokenClientCallback) {
      tokenClientCallback({ error: 'popup_closed_by_user', error_description: 'User closed popup' });
    }

    // Verify queue is still intact and not rejected
    expect(authService.getState().needsReconnect).toBe(true);

    // Simulate user trying again and successfully authenticating
    (authService as any).setAccessToken('eventual-token', 3600);

    const res = await fetchPromise;
    expect(res.status).toBe(200);
  });

  it('re-triggers markNeedsReconnect if a retried request also returns 401', async () => {
    (authService as any).setAccessToken('first-token', 3600);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: any) => {
      if (String(url).includes('drive/v3/about')) {
        return new Response('{}', { status: 200 });
      }
      callCount++;
      return new Response('Unauthorized', { status: 401 });
    });

    const fetchPromise = driveFetch('https://www.googleapis.com/drive/v3/files');
    await new Promise((r) => setTimeout(r, 10));

    expect(authService.getState().needsReconnect).toBe(true);

    // Provide a second token
    (authService as any).setAccessToken('second-token', 3600);

    const finalRes = await fetchPromise;
    expect(finalRes.status).toBe(401);
    expect(callCount).toBe(2);
    expect(authService.getState().needsReconnect).toBe(true);
  });

  it('sets informative error when requestToken is called without configured clientId', async () => {
    (authService as any).currentClientId = '';
    (authService as any).tokenClient = null;

    await authService.requestToken();

    const state = authService.getState();
    expect(state.error).toContain('Google OAuth Client ID is not configured');
  });

  it('deduplicates concurrent setupTokenClient calls using the same promise', async () => {
    const mockInit = vi.fn().mockReturnValue({
      requestAccessToken: vi.fn(),
    });
    const mockWindow = {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: mockInit,
          },
        },
      },
    };
    (globalThis as any).window = mockWindow;

    (authService as any).tokenClient = null;
    (authService as any).currentClientId = 'test-concurrent-client-id';

    // Call setupTokenClient concurrently
    const p1 = (authService as any).setupTokenClient('test-concurrent-client-id');
    const p2 = (authService as any).setupTokenClient('test-concurrent-client-id');

    const [c1, c2] = await Promise.all([p1, p2]);
    expect(c1).toBe(c2);
    expect(mockInit).toHaveBeenCalledTimes(1);
  });

  it('handles error_callback for popup_failed_to_open with browser blocked message', async () => {
    let capturedErrorCallback: ((err: any) => void) | undefined;
    const mockWindow = {
      google: {
        accounts: {
          oauth2: {
            initTokenClient: vi.fn().mockImplementation((config: any) => {
              capturedErrorCallback = config.error_callback;
              return { requestAccessToken: vi.fn() };
            }),
          },
        },
      },
    };
    (globalThis as any).window = mockWindow;

    (authService as any).tokenClient = null;
    await (authService as any).setupTokenClient('test-popup-block-client');

    expect(capturedErrorCallback).toBeDefined();
    capturedErrorCallback!({
      type: 'popup_failed_to_open',
      message: 'Popup blocked by browser',
    });

    const state = authService.getState();
    expect(state.error).toContain('blocked');
  });
});

