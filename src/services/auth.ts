import type { DriveUser } from '../types';
import { getSetting, setSetting } from './db';

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const SETTING_CLIENT_ID = 'google_client_id';

export interface AuthStateChange {
  isAuthenticated: boolean;
  needsReconnect: boolean;
  isInitializing: boolean;
  user: DriveUser | null;
  error: string | null;
  clientId: string;
  isIOSStandalone: boolean;
}

type AuthListener = (state: AuthStateChange) => void;

class AuthService {
  // In-memory access token ONLY - never written to localStorage or IndexedDB
  private accessToken: string | null = null;
  private tokenExpiresAt: number | null = null;
  private userProfile: DriveUser | null = null;
  private isNeedsReconnect: boolean = false;
  private isInitializing: boolean = true;
  private lastError: string | null = null;
  private currentClientId: string = '';

  private tokenClient: google.accounts.oauth2.TokenClient | null = null;
  private pendingTokenResolvers: Array<{
    resolve: (token: string) => void;
    reject: (err: Error) => void;
  }> = [];
  private listeners: Set<AuthListener> = new Set();

  constructor() {
    this.detectStandalone();
  }

  public isIOSStandaloneMode(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    const nav = (window.navigator as any) || (typeof navigator !== 'undefined' ? navigator : null);
    const isStandalone =
      nav?.standalone === true ||
      (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)')?.matches);
    return !!(isIOS && isStandalone);
  }

  private detectStandalone(): boolean {
    return this.isIOSStandaloneMode();
  }

  public async init(): Promise<void> {
    this.isInitializing = true;
    this.notify();

    try {
      console.log('[AuthService] Initializing authService...');
      // 1. Try env variable first, then stored setting
      const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
      const storedClientId = await getSetting<string>(SETTING_CLIENT_ID, '');
      this.currentClientId = envClientId || storedClientId || '';
      console.log('[AuthService] Client ID loaded on boot:', this.currentClientId ? `${this.currentClientId.slice(0, 12)}...` : '(none)');

      if (this.currentClientId) {
        await this.setupTokenClient(this.currentClientId);
      } else {
        // Pre-load GIS script in background so it is cached and ready
        this.loadGisScript().catch((err) => {
          console.warn('[AuthService] Background GIS script preload note:', err);
        });
      }
    } catch (err: any) {
      console.error('[AuthService] Failed to initialize AuthService:', err);
      this.lastError = err?.message || 'Failed to initialize Google Auth';
    } finally {
      this.isInitializing = false;
      this.notify();
    }
  }

  public async setClientId(clientId: string): Promise<void> {
    const trimmed = clientId.trim();
    if (this.currentClientId !== trimmed) {
      this.tokenClient = null;
    }
    this.currentClientId = trimmed;
    await setSetting(SETTING_CLIENT_ID, trimmed);
    console.log('[AuthService] Client ID updated:', trimmed ? `${trimmed.slice(0, 12)}...` : '(cleared)');
    if (trimmed) {
      await this.setupTokenClient(trimmed);
    } else {
      this.tokenClient = null;
    }
    this.notify();
  }

  public getClientId(): string {
    return this.currentClientId;
  }

  private tokenClientSetupPromise: Promise<google.accounts.oauth2.TokenClient> | null = null;

  private async loadGisScript(timeoutMs = 10000): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }
    if (window.google?.accounts?.oauth2) {
      console.log('[AuthService] GIS SDK already available on window.google.accounts.oauth2');
      return;
    }

    console.log('[AuthService] Waiting for GIS SDK to load...');
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(checkInterval);
          console.log('[AuthService] GIS SDK successfully verified.');
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          const err = new Error('Google Identity Services SDK failed to load within timeout. Please check your network or adblocker.');
          console.error('[AuthService]', err);
          reject(err);
        }
      }, 50);

      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (!existing) {
        console.log('[AuthService] Creating and appending GIS script tag...');
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onerror = (e) => {
          clearInterval(checkInterval);
          const err = new Error('Failed to load Google Identity Services library. Check CSP or network.');
          console.error('[AuthService]', err, e);
          reject(err);
        };
        document.head.appendChild(script);
      }
    });
  }

  private async setupTokenClient(clientId: string): Promise<google.accounts.oauth2.TokenClient> {
    if (this.tokenClient && this.currentClientId === clientId) {
      console.log('[AuthService] Token client already initialized for this clientId');
      return this.tokenClient;
    }
    if (this.tokenClientSetupPromise) {
      console.log('[AuthService] Token client setup already in flight, awaiting existing promise...');
      return await this.tokenClientSetupPromise;
    }

    this.tokenClientSetupPromise = (async () => {
      console.log('[AuthService] Initializing GIS TokenClient for client_id:', `${clientId.slice(0, 12)}...`);
      await this.loadGisScript();

      if (!window?.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services SDK not available.');
      }

      console.log('[AuthService] Calling window.google.accounts.oauth2.initTokenClient...');
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: DRIVE_SCOPE,
        callback: (response: google.accounts.oauth2.TokenResponse) => {
          console.log('[AuthService] GIS token callback received:', {
            hasAccessToken: !!response.access_token,
            error: response.error,
            error_description: response.error_description,
            expires_in: response.expires_in,
          });

          if (response.error) {
            console.error('[AuthService] GIS OAuth token callback returned error:', response.error, response.error_description);
            const msg = response.error_description || response.error;
            this.lastError = msg;
            this.notify();
            return;
          }

          const expiresIn = Number(response.expires_in) || 3600;
          console.log('[AuthService] Successfully acquired access token, setting in-memory token (expires in', expiresIn, 'seconds)');
          this.setAccessToken(response.access_token, expiresIn);
        },
        error_callback: (error: google.accounts.oauth2.ClientConfigError) => {
          console.error('[AuthService] GIS error_callback received:', {
            type: error?.type,
            message: error?.message,
          });
          let errorMsg = error?.message || error?.type || 'OAuth popup failed or was blocked';
          if (error?.type === 'popup_failed_to_open') {
            errorMsg = 'Sign-in popup was blocked by browser. Please allow popups for localhost:5173.';
          } else if (error?.type === 'popup_closed') {
            errorMsg = 'Sign-in popup was closed before completing authentication.';
          }
          if (this.isIOSStandaloneMode()) {
            errorMsg = 'OAuth popup blocked in iOS Home Screen mode. Open the app in Safari to sign in.';
          }
          this.lastError = errorMsg;
          this.notify();
        },
      });

      this.tokenClient = client;
      this.currentClientId = clientId;
      console.log('[AuthService] GIS TokenClient initialized successfully and stored');
      return client;
    })().finally(() => {
      this.tokenClientSetupPromise = null;
    });

    return await this.tokenClientSetupPromise;
  }

  private setAccessToken(token: string, expiresInSeconds: number): void {
    this.accessToken = token;
    // Buffer expiration by 60 seconds
    this.tokenExpiresAt = Date.now() + Math.max(0, expiresInSeconds - 60) * 1000;
    this.isNeedsReconnect = false;
    this.lastError = null;

    // Fetch user profile info via Drive 'about' endpoint (strictly within drive.readonly scope)
    this.fetchUserInfo(token);

    // Resolve any paused/queued requests
    this.resolvePendingRequests(token);

    this.notify();
  }

  private async fetchUserInfo(token: string): Promise<void> {
    try {
      const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink)', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          this.userProfile = {
            displayName: data.user.displayName,
            emailAddress: data.user.emailAddress,
            photoLink: data.user.photoLink,
          };
          this.notify();
        }
      }
    } catch (err) {
      console.warn('Unable to retrieve user info from Drive:', err);
    }
  }

  /**
   * Triggers the Google OAuth popup. MUST be called directly from a user tap/click.
   * Uses prompt: 'select_account' so re-authorization prompts the account chooser
   * instead of silently failing when a token has expired.
   */
  public async requestToken(): Promise<void> {
    console.log('[AuthService] Reconnect / requestToken() invoked.', {
      currentClientId: this.currentClientId ? `${this.currentClientId.slice(0, 12)}...` : '(empty)',
      hasTokenClient: !!this.tokenClient,
      gisLoaded: typeof window !== 'undefined' && !!window.google?.accounts?.oauth2,
      isIOSStandalone: this.isIOSStandaloneMode(),
      needsReconnect: this.isNeedsReconnect,
    });

    this.lastError = null;

    // 1. If clientId not in memory, try loading from setting or env
    if (!this.currentClientId) {
      console.log('[AuthService] currentClientId is empty in memory, checking storage/env...');
      const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
      const storedClientId = await getSetting<string>(SETTING_CLIENT_ID, '');
      this.currentClientId = envClientId || storedClientId || '';
      console.log('[AuthService] Fallback check found client ID:', this.currentClientId ? `${this.currentClientId.slice(0, 12)}...` : '(none)');
    }

    if (!this.currentClientId) {
      const msg = 'Google OAuth Client ID is not configured. Please open Settings -> Google Auth to enter your Client ID.';
      console.error('[AuthService] ' + msg);
      this.lastError = msg;
      this.notify();
      return;
    }

    // 2. Synchronous fast-path: if tokenClient is already initialized, call requestAccessToken immediately!
    // This preserves user activation gesture so browsers never block the popup!
    if (this.tokenClient) {
      console.log('[AuthService] tokenClient is ready. Dispatching tokenClient.requestAccessToken({ prompt: "select_account" }) synchronously...');
      try {
        this.tokenClient.requestAccessToken({ prompt: 'select_account' });
        console.log('[AuthService] requestAccessToken({ prompt: "select_account" }) dispatched successfully');
        return;
      } catch (err: any) {
        console.error('[AuthService] Error during synchronous tokenClient.requestAccessToken:', err);
        let msg = err.message || 'Failed to open Google Sign-In popup';
        if (this.isIOSStandaloneMode()) {
          msg = 'OAuth popup blocked in iOS Home Screen mode. Open the app in Safari to sign in.';
        }
        this.lastError = msg;
        this.notify();
        return;
      }
    }

    // 3. If tokenClient is not yet ready, initialize it now and then call requestAccessToken
    console.log('[AuthService] tokenClient not yet ready. Setting up token client now...');
    try {
      const client = await this.setupTokenClient(this.currentClientId);
      console.log('[AuthService] Token client setup finished. Calling requestAccessToken({ prompt: "select_account" })...');
      client.requestAccessToken({ prompt: 'select_account' });
      console.log('[AuthService] requestAccessToken({ prompt: "select_account" }) dispatched successfully');
    } catch (err: any) {
      console.error('[AuthService] Failed to set up token client or request token:', err);
      let msg = err.message || 'Failed to open Google Sign-In popup';
      if (this.isIOSStandaloneMode()) {
        msg = 'OAuth popup blocked in iOS Home Screen mode. Open the app in Safari to sign in.';
      }
      this.lastError = msg;
      this.notify();
    }
  }

  /**
   * Retrieves the current access token if valid.
   * If token is missing or expired, pauses and returns a promise that resolves
   * when the user taps Reconnect/Sign In.
   */
  public async getOrWaitForToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    // Token is either absent or expired
    this.markNeedsReconnect();

    return new Promise<string>((resolve, reject) => {
      this.pendingTokenResolvers.push({ resolve, reject });
    });
  }

  /**
   * Signals that 401 occurred or token is needed.
   * Prompts persistent UI to show "Reconnect Google".
   */
  public markNeedsReconnect(): void {
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.isNeedsReconnect = true;
    this.notify();
  }

  public waitForToken(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.pendingTokenResolvers.push({ resolve, reject });
    });
  }

  private resolvePendingRequests(token: string): void {
    const queue = [...this.pendingTokenResolvers];
    this.pendingTokenResolvers = [];
    queue.forEach(({ resolve }) => resolve(token));
  }

  private rejectPendingRequests(err: Error): void {
    const queue = [...this.pendingTokenResolvers];
    this.pendingTokenResolvers = [];
    queue.forEach(({ reject }) => reject(err));
  }

  public signOut(): void {
    if (this.accessToken && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(this.accessToken, () => {});
      } catch (e) {
        console.warn('Error during token revocation:', e);
      }
    }
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.userProfile = null;
    this.isNeedsReconnect = false;
    this.lastError = null;
    this.rejectPendingRequests(new Error('User signed out'));
    this.notify();
  }

  public getState(): AuthStateChange {
    return {
      isAuthenticated: !!this.accessToken && !!this.tokenExpiresAt && Date.now() < this.tokenExpiresAt,
      needsReconnect: this.isNeedsReconnect,
      isInitializing: this.isInitializing,
      user: this.userProfile,
      error: this.lastError,
      clientId: this.currentClientId,
      isIOSStandalone: this.isIOSStandaloneMode(),
    };
  }

  public subscribe(listener: AuthListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

export const authService = new AuthService();
