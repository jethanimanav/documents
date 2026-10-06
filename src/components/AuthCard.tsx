import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  KeyRound,
  ExternalLink,
  LogOut,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Smartphone,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { driveFetch } from '../services/driveFetch';
import { authService } from '../services/auth';

export const AuthCard: React.FC = () => {
  const {
    isAuthenticated,
    needsReconnect,
    isInitializing,
    user,
    error,
    clientId,
    isIOSStandalone,
    signIn,
    reconnect,
    setClientId,
    signOut,
    signOutAndWipe,
  } = useAuth();

  const [inputClientId, setInputClientId] = useState(clientId);
  const [isSavingClientId, setIsSavingClientId] = useState(false);
  const [testApiResult, setTestApiResult] = useState<{
    success: boolean;
    data?: any;
    error?: string;
    latencyMs?: number;
  } | null>(null);
  const [isTestingApi, setIsTestingApi] = useState(false);
  const [showConfirmWipe, setShowConfirmWipe] = useState(false);

  useEffect(() => {
    setInputClientId(clientId);
  }, [clientId]);

  const handleSaveClientId = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingClientId(true);
    try {
      await setClientId(inputClientId);
    } finally {
      setIsSavingClientId(false);
    }
  };

  const handleTestDriveApi = async () => {
    setIsTestingApi(true);
    setTestApiResult(null);
    const start = performance.now();
    try {
      // Test drive.readonly endpoint
      const res = await driveFetch(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota'
      );
      const latency = Math.round(performance.now() - start);

      if (!res.ok) {
        throw new Error(`Drive API returned HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setTestApiResult({
        success: true,
        data,
        latencyMs: latency,
      });
    } catch (err: any) {
      setTestApiResult({
        success: false,
        error: err.message || 'Drive API call failed',
      });
    } finally {
      setIsTestingApi(false);
    }
  };

  const handleSimulate401 = async () => {
    // Manually trigger 401 flow to verify the persistent reconnect banner and auto-retry
    authService.markNeedsReconnect();
  };

  const handleOpenInSafari = () => {
    window.open(window.location.href, '_system');
  };

  const formatQuota = (bytes?: string) => {
    if (!bytes) return 'N/A';
    const num = Number(bytes);
    if (isNaN(num)) return 'N/A';
    return (num / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 sm:p-6 shadow-xl max-w-2xl mx-auto space-y-6">
      {/* Header & Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-950/60 border border-blue-800/50 rounded-xl text-blue-400">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Google Drive Authentication</h2>
            <p className="text-xs text-neutral-400">Strict Read-Only Access & In-Memory Token</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : needsReconnect ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-950 text-amber-400 border border-amber-800">
              <AlertCircle className="w-3.5 h-3.5" />
              Needs Reconnect
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-neutral-800 text-neutral-400 border border-neutral-700">
              Disconnected
            </span>
          )}
        </div>
      </div>

      {/* iOS Standalone Warning / Fallback Notice */}
      {isIOSStandalone && (
        <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 font-semibold text-blue-300">
            <Smartphone className="w-4 h-4" />
            <span>iOS Home Screen PWA Mode Detected</span>
          </div>
          <p className="text-neutral-300">
            iOS Safari restricts OAuth popups inside installed Home Screen PWAs. If tapping Connect closes immediately
            or fails, open this app in Safari to complete authentication.
          </p>
          <button
            type="button"
            onClick={handleOpenInSafari}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open in Safari
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-950/50 border border-red-800/60 rounded-xl p-3.5 text-xs text-red-300 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Authentication Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Client ID Configuration Form */}
      <form onSubmit={handleSaveClientId} className="space-y-3">
        <label htmlFor="clientIdInput" className="block text-xs font-medium text-neutral-300">
          Google OAuth 2.0 Web Client ID
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="clientIdInput"
            type="text"
            value={inputClientId}
            onChange={(e) => setInputClientId(e.target.value)}
            placeholder="e.g. 1234567890-abcdefgh.apps.googleusercontent.com"
            className="flex-1 bg-neutral-950 border border-neutral-700 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={isSavingClientId}
            className="min-h-[44px] px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-950 text-neutral-200 border border-neutral-700 rounded-xl font-medium text-sm transition-colors cursor-pointer shrink-0"
          >
            {isSavingClientId ? 'Saving...' : 'Save ID'}
          </button>
        </div>
        <p className="text-[11px] text-neutral-500">
          Created in Google Cloud Console. Authorized Origins must include{' '}
          <code className="text-neutral-400 bg-neutral-950 px-1 py-0.5 rounded">
            {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}
          </code>
        </p>
      </form>

      {/* Connection & User Details */}
      {isAuthenticated && user && (
        <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {user.photoLink ? (
              <img src={user.photoLink} alt={user.displayName || 'User'} className="w-10 h-10 rounded-full border border-neutral-700" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-900 text-blue-200 font-bold flex items-center justify-center text-sm">
                {(user.displayName || user.emailAddress || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-white">{user.displayName || 'Google Account'}</p>
              <p className="text-xs text-neutral-400">{user.emailAddress || 'Connected via drive.readonly'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main Action Buttons */}
      <div className="space-y-3">
        {!isAuthenticated ? (
          <button
            type="button"
            onClick={signIn}
            disabled={!clientId || isInitializing}
            className="w-full min-h-[48px] px-5 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2.5 shadow-lg transition-all cursor-pointer"
          >
            <KeyRound className="w-4 h-4" />
            {clientId ? 'Sign in with Google' : 'Configure Client ID Above First'}
          </button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleTestDriveApi}
              disabled={isTestingApi}
              className="min-h-[44px] px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded-xl font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <HardDrive className="w-4 h-4 text-blue-400" />
              {isTestingApi ? 'Testing...' : 'Test Drive API Connection'}
            </button>

            <button
              type="button"
              onClick={handleSimulate401}
              className="min-h-[44px] px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-800 text-amber-300 border border-neutral-700 rounded-xl font-medium text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              Simulate 401 Expiry Flow
            </button>
          </div>
        )}

        {/* When reconnect is required */}
        {needsReconnect && (
          <button
            type="button"
            onClick={reconnect}
            className="w-full min-h-[48px] px-5 py-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-semibold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 animate-spin-reverse" />
            Reconnect Google Drive Now
          </button>
        )}
      </div>

      {/* Test API Result Output */}
      {testApiResult && (
        <div
          className={`p-4 rounded-xl text-xs space-y-2 border ${
            testApiResult.success
              ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
              : 'bg-red-950/40 border-red-800 text-red-200'
          }`}
        >
          <div className="flex items-center justify-between font-semibold">
            <span>{testApiResult.success ? 'Drive API Verified OK' : 'Drive API Test Failed'}</span>
            {testApiResult.latencyMs !== undefined && (
              <span className="text-[11px] opacity-80">{testApiResult.latencyMs} ms</span>
            )}
          </div>
          {testApiResult.success && testApiResult.data && (
            <div className="space-y-1 font-mono text-[11px] bg-neutral-950/60 p-2.5 rounded border border-neutral-800/80">
              <div>User: {testApiResult.data.user?.displayName} ({testApiResult.data.user?.emailAddress})</div>
              {testApiResult.data.storageQuota && (
                <div>
                  Storage: {formatQuota(testApiResult.data.storageQuota.usage)} / {formatQuota(testApiResult.data.storageQuota.limit)}
                </div>
              )}
            </div>
          )}
          {testApiResult.error && <div>{testApiResult.error}</div>}
        </div>
      )}

      {/* Security Principles & Guarantees info box */}
      <div className="bg-neutral-950/50 border border-neutral-800/80 rounded-xl p-4 text-xs space-y-2.5">
        <div className="flex items-center gap-2 text-neutral-300 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Security & Scope Guarantees</span>
        </div>
        <ul className="text-neutral-400 space-y-1.5 list-disc list-inside">
          <li>
            <strong className="text-neutral-200">Scope:</strong>{' '}
            <code className="text-blue-400 font-mono text-[11px]">https://www.googleapis.com/auth/drive.readonly</code>{' '}
            ONLY. Technical guarantee that original files cannot be edited or deleted.
          </li>
          <li>
            <strong className="text-neutral-200">Token storage:</strong> Kept in memory only (never written to
            localStorage or IndexedDB).
          </li>
          <li>
            <strong className="text-neutral-200">Offline search:</strong> Cached file index in IndexedDB remains
            searchable even when signed out.
          </li>
        </ul>
      </div>

      {/* Sign Out & Wipe local data */}
      {isAuthenticated && (
        <div className="pt-4 border-t border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={signOut}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out (Keeps local index)
          </button>

          {!showConfirmWipe ? (
            <button
              type="button"
              onClick={() => setShowConfirmWipe(true)}
              className="w-full sm:w-auto min-h-[44px] px-4 py-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-800/50 rounded-xl text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Sign Out & Wipe Local Data
            </button>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={signOutAndWipe}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Confirm Wipe
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmWipe(false)}
                className="min-h-[44px] px-3 py-2 bg-neutral-800 text-neutral-300 rounded-xl text-xs cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
