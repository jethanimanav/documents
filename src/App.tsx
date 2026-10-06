import React, { useEffect, useState } from 'react';
import {
  FileText,
  Wifi,
  WifiOff,
  Shield,
  Layers,
  Sparkles,
  Smartphone,
} from 'lucide-react';
import { ReconnectBanner } from './components/ReconnectBanner';
import { AuthCard } from './components/AuthCard';
import { useAuth } from './hooks/useAuth';
import { authService } from './services/auth';

export const App: React.FC = () => {
  const { isAuthenticated, needsReconnect, user, isIOSStandalone } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // Initialize Google Identity Services and load stored client ID
    authService.init();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Persistent Reconnect Banner for 401 & Token Expiry */}
      <ReconnectBanner />

      {/* Top Header */}
      <header
        className={`sticky top-0 z-40 bg-neutral-900/90 backdrop-blur-md border-b border-neutral-800 transition-all ${
          needsReconnect ? 'pt-16 sm:pt-14' : ''
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-white">DocManager</h1>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60">
                  Step 1
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-none">0-cost client-only PWA</p>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex items-center gap-2">
            {/* Online / Offline badge */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                isOnline
                  ? 'bg-neutral-900 text-neutral-400 border-neutral-800'
                  : 'bg-amber-950/80 text-amber-300 border-amber-800'
              }`}
              title={isOnline ? 'Online' : 'Offline: local cache accessible'}
            >
              {isOnline ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-amber-400" />}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Google Auth Status Badge */}
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                isAuthenticated
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800 hover:bg-emerald-900/80'
                  : needsReconnect
                  ? 'bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isAuthenticated ? 'bg-emerald-400 animate-pulse' : needsReconnect ? 'bg-amber-400 animate-ping' : 'bg-neutral-600'
                }`}
              />
              <span className="text-xs">
                {isAuthenticated ? (user?.displayName ? user.displayName.split(' ')[0] : 'Connected') : 'OAuth'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Step 1 Verification Banner */}
        <section className="bg-gradient-to-r from-blue-950/40 via-neutral-900 to-neutral-900 border border-blue-900/40 rounded-2xl p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">Step 1: Scaffold + OAuth + Token/Reconnect Flow</h2>
              </div>
              <p className="text-xs text-neutral-300">
                Testing OAuth 2.0 Web Client authentication with strict read-only scope (<code className="text-blue-300">drive.readonly</code>)
                and resilient 401 token refresh queue.
              </p>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-neutral-400 bg-neutral-950/80 px-3 py-1.5 rounded-lg border border-neutral-800 shrink-0">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>In-Memory Token</span>
            </div>
          </div>
        </section>

        {/* Auth & Device Testing Card */}
        <AuthCard />

        {/* Step 1 Validation & Test Checklist */}
        <section className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-neutral-200">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-sm">Step 1 Device & Verification Checklist</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-xl space-y-1.5">
              <p className="font-medium text-neutral-200 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                Authorized Origins
              </p>
              <p className="text-neutral-400 text-[11px]">
                Google Cloud requires registering authorized JavaScript origins:
                <br />
                <code className="text-neutral-300 font-mono">http://localhost:5173</code> (Desktop/Dev)
              </p>
            </div>

            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-xl space-y-1.5">
              <p className="font-medium text-neutral-200 flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-400" />
                Mobile Device Testing
              </p>
              <p className="text-neutral-400 text-[11px]">
                {isIOSStandalone
                  ? 'Currently running inside iOS Standalone Home Screen PWA. If popup is blocked by Apple, open in Safari.'
                  : 'Access via your phone browser on the same Wi-Fi using the local network URL displayed in the Vite terminal.'}
              </p>
            </div>

            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-xl space-y-1.5">
              <p className="font-medium text-neutral-200 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                401 Interception Test
              </p>
              <p className="text-neutral-400 text-[11px]">
                Click <strong className="text-neutral-300">Simulate 401 Expiry Flow</strong> above to verify that
                the app immediately pauses background Drive calls and shows the persistent Reconnect banner.
              </p>
            </div>

            <div className="p-3.5 bg-neutral-950/70 border border-neutral-800/80 rounded-xl space-y-1.5">
              <p className="font-medium text-neutral-200 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                Next Step Preview
              </p>
              <p className="text-neutral-400 text-[11px]">
                Step 2 will implement the recursive root folder walk, breadth-first crawler, Dexie IndexedDB cache,
                instant MiniSearch in-memory index, and Drive Changes API sync.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-800/60 py-4 text-center text-xs text-neutral-500">
        Personal Document Manager & Upload-Size Utility &bull; $0 Forever &bull; Strictly Read-Only
      </footer>
    </div>
  );
};

export default App;
