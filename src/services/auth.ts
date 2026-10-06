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
    if (typeof window === 'undefined') return false;
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;
    return isIOS && isStandalone;
  }

  private detectStandalone(): boolean {
    return this.isIOSStandaloneMode();
  }

  public async init(): Promise<void> {
    this.isInitializing = true;
    this.notify();

    try {
      // 1. Try env variable first, then stored setting
      const envClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '';
      const storedClientId = await getSetting<string>(SETTING_CLIENT_ID, '');
      this.currentClientId = envClientId || storedClientId || '';

      if (this.currentClientId) {
        await this.setupTokenClient(this.currentClientId);
      }
    } catch (err: any) {
      console.error('Failed to initialize AuthService:', err);
      this.lastError = err?.message || 'Failed to initialize Google Auth';
    } finally {
      this.isInitializing = false;
      this.notify();
    }
  }

  public async setClientId(clientId: string): Promise<void> {
    const trimmed = clientId.trim();
    this.currentClientId = trimmed;
    await setSetting(SETTING_CLIENT_ID, trimmed);
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

  private async loadGisScript(): Promise<void> {
    if (window.google?.accounts?.oauth2) {
      return;
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
      if (existing) {
        const checkInterval = setInterval(() => {
          if (window.google?.accounts?.oauth2) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        const checkInterval = setInterval(() => {
          if (window.google?.accounts?.oauth2) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 50);
      };
      script.onerror = () => reject(new Error('Failed to load Google Identity Services library. Check CSP or network.'));
      document.head.appendChild(script);
    });
  }

  private async setupTokenClient(clientId: string): Promise<void> {
    await this.loadGisScript();

    if (!window.google?.accounts?.oauth2) {
      throw new Error('Google Identity Services SDK not available.');
    }

    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response: google.accounts.oauth2.TokenResponse) => {
        if (response.error) {
          console.error('Google OAuth token error:', response);
          const msg = response.error_description || response.error;
          this.lastError = msg;
          this.rejectPendingRequests(new Error(msg));
          this.notify();
          return;
        }

        const expiresIn = Number(response.expires_in) || 3600;
        this.setAccessToken(response.access_token, expiresIn);
      },
      error_callback: (error: google.accounts.oauth2.ClientConfigError) => {
        console.error('Google OAuth configuration error:', error);
        let errorMsg = error.message || 'OAuth popup failed or was blocked';
        if (this.isIOSStandaloneMode()) {
          errorMsg = 'OAuth popup blocked in iOS Home Screen mode. Open the app in Safari to sign in.';
        }
        this.lastError = errorMsg;
        this.rejectPendingRequests(new Error(errorMsg));
        this.notify();
      },
    });
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
   */
  public requestToken(): void {
    this.lastError = null;

    if (!this.currentClientId) {
      this.lastError = 'Please configure a Google OAuth Client ID first.';
      this.notify();
      return;
    }

    if (!this.tokenClient) {
      this.setupTokenClient(this.currentClientId)
        .then(() => {
          if (this.tokenClient) {
            this.tokenClient.requestAccessToken({ prompt: '' });
          }
        })
        .catch((err) => {
          this.lastError = err.message;
          this.notify();
        });
      return;
    }

    try {
      this.tokenClient.requestAccessToken({ prompt: '' });
    } catch (err: any) {
      console.error('Failed to request access token:', err);
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
