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
  Database,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { driveFetch } from '../services/driveFetch';
import { authService } from '../services/auth';
import {
  getCacheMetadataStats,
  wipeMetadataCacheOnly,
  type CacheMetadataStats,
} from '../services/db';
import { formatFileSize } from '../utils/folder';
import { searchIndex } from '../services/searchIndex';

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

  // Cache management state (Milestone 5)
  const [cacheStats, setCacheStats] = useState<CacheMetadataStats | null>(null);
  const [showConfirmCacheWipe, setShowConfirmCacheWipe] = useState(false);
  const [isWipingCache, setIsWipingCache] = useState(false);
  const [cacheMessage, setCacheMessage] = useState<string | null>(null);

  useEffect(() => {
    getCacheMetadataStats().then(setCacheStats);
  }, [isAuthenticated]);

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

  const handleWipeCacheOnly = async () => {
    setIsWipingCache(true);
    setCacheMessage(null);
    try {
      await wipeMetadataCacheOnly();
      searchIndex.clear();
      const updated = await getCacheMetadataStats();
      setCacheStats(updated);
      setShowConfirmCacheWipe(false);
      setCacheMessage('Local metadata cache wiped. Original Google Drive files remain untouched.');
      setTimeout(() => setCacheMessage(null), 4000);
    } catch (err: any) {
      setCacheMessage(err?.message || 'Failed to wipe cache');
    } finally {
      setIsWipingCache(false);
    }
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
            <h2 className="text-lg font-semibold text-white">Privacy & Account Security</h2>
            <p className="text-xs text-neutral-400">Strict Read-Only Scope & Memory-Only Token Architecture</p>
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

      {/* Connection & Current Google Account Confirmation (Milestone 5) */}
      <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-neutral-300">Active Google Account</span>
          <span className="text-[11px] font-mono text-neutral-400">
            {isAuthenticated ? 'Authenticated' : 'Not Connected'}
          </span>
        </div>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            {user.photoLink ? (
              <img
                src={user.photoLink}
                alt={user.displayName || 'Google Account'}
                className="w-11 h-11 rounded-full border border-neutral-700 object-cover shrink-0"
              />
            ) : (
              <div className="w-11 h-11 rounded-full bg-blue-900 text-blue-200 font-bold flex items-center justify-center text-sm shrink-0">
                {(user.displayName || user.emailAddress || 'U').charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                {user.displayName || 'Google Account'}
              </p>
              <p className="text-xs text-neutral-400 truncate">
                {user.emailAddress || 'Connected with drive.readonly scope'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-neutral-500">
            No active Google account session. Sign in below using your Google Client ID.
          </p>
        )}
      </div>

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

      {/* Local Cache Management (Milestone 5) */}
      <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-neutral-200 font-semibold text-xs">
            <Database className="w-4 h-4 text-orange-400" />
            <span>Local Cache Management</span>
          </div>
          <span className="text-[11px] text-neutral-400 font-mono">
            {formatFileSize(cacheStats?.estimatedSizeBytes ?? 0)}
          </span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
          <div className="bg-neutral-900/90 p-2 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 block">Documents</span>
            <span className="font-semibold text-neutral-100 font-mono">
              {cacheStats?.docCount ?? 0}
            </span>
          </div>
          <div className="bg-neutral-900/90 p-2 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 block">Folders</span>
            <span className="font-semibold text-neutral-100 font-mono">
              {cacheStats?.folderCount ?? 0}
            </span>
          </div>
          <div className="bg-neutral-900/90 p-2 rounded-lg border border-neutral-800">
            <span className="text-[10px] text-neutral-400 block">Notes & Tags</span>
            <span className="font-semibold text-neutral-100 font-mono">
              {cacheStats?.detailsCount ?? 0}
            </span>
          </div>
        </div>

        {cacheMessage && (
          <div className="p-2.5 bg-emerald-950/50 border border-emerald-800/80 rounded-lg text-emerald-300 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{cacheMessage}</span>
          </div>
        )}

        {/* Wipe Cache Only Button & Confirmation */}
        {!showConfirmCacheWipe ? (
          <button
            type="button"
            onClick={() => setShowConfirmCacheWipe(true)}
            className="w-full min-h-[38px] px-3.5 py-2 bg-neutral-900 hover:bg-neutral-850 text-neutral-300 border border-neutral-700/80 rounded-xl text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5 text-neutral-400" />
            <span>Wipe Local Metadata Cache Only</span>
          </button>
        ) : (
          <div className="p-3 bg-neutral-900 border border-amber-800/80 rounded-xl space-y-2 text-xs">
            <div className="flex items-start gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-snug">
                Clear all locally indexed documents and folders? Your original Google Drive files will <strong>NEVER</strong> be modified or deleted.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleWipeCacheOnly}
                disabled={isWipingCache}
                className="flex-1 py-1.5 px-3 bg-amber-600 hover:bg-amber-500 text-black font-bold rounded-lg text-xs cursor-pointer transition-colors"
              >
                {isWipingCache ? 'Wiping...' : 'Confirm Wipe Cache'}
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmCacheWipe(false)}
                className="py-1.5 px-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Security Principles & Guarantees info box (Milestone 5) */}
      <div className="bg-neutral-950/50 border border-neutral-800/80 rounded-xl p-4 text-xs space-y-2.5">
        <div className="flex items-center gap-2 text-neutral-300 font-semibold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Security & Scope Guarantees</span>
        </div>
        <ul className="text-neutral-400 space-y-2 list-none">
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
            <div>
              <strong className="text-neutral-200">Strict Read-Only Scope:</strong> Uses{' '}
              <code className="text-blue-400 font-mono text-[11px]">drive.readonly</code> exclusively.
              Cryptographically guarantees that Personal Docs CANNOT delete, overwrite, modify, or upload files to your Google Drive.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
            <div>
              <strong className="text-neutral-200">Memory-Only Token:</strong> OAuth access tokens are held strictly in temporary browser RAM and are never persisted to disk, localStorage, or IndexedDB.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
            <div>
              <strong className="text-neutral-200">Zero Document Bytes on Disk:</strong> Only metadata (file names, sizes, categories) is cached in IndexedDB. Document bytes are downloaded transiently into memory on demand.
            </div>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0 mt-1.5" />
            <div>
              <strong className="text-neutral-200">Service Worker Cache Isolation:</strong> Service Worker caches only static application code. Google Drive API endpoints and tokens are strictly forbidden from Service Worker cache storage.
            </div>
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
              Sign Out & Wipe Everything
            </button>
          ) : (
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={signOutAndWipe}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Confirm Full Wipe
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
