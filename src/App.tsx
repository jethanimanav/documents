import React, { useEffect, useState } from 'react';
import {
  FileText,
  Wifi,
  WifiOff,
  Settings,
} from 'lucide-react';
import { ReconnectBanner } from './components/ReconnectBanner';
import { DocumentList } from './components/DocumentList';
import { SettingsModal } from './components/SettingsModal';
import { ImageCompressModal } from './components/ImageCompressModal';
import { useAuth } from './hooks/useAuth';
import { authService } from './services/auth';
import type { DocItem } from './types';

export const App: React.FC = () => {
  const { isAuthenticated, needsReconnect, user } = useAuth();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);

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
        className={`sticky top-0 z-40 bg-neutral-900/95 backdrop-blur-md border-b border-neutral-800 transition-all ${
          needsReconnect ? 'pt-16 sm:pt-14' : ''
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base tracking-tight text-white">DocManager</h1>
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60">
                  Step 3
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-none">0-cost client-only PWA</p>
            </div>
          </div>

          {/* Header Controls: Offline Badge, Auth Status, Settings */}
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

            {/* Google Auth Status Pill */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className={`min-h-[36px] flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer border transition-colors ${
                isAuthenticated
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800 hover:bg-emerald-900/80'
                  : needsReconnect
                  ? 'bg-amber-950 text-amber-300 border-amber-800 hover:bg-amber-900'
                  : 'bg-neutral-900 text-neutral-400 border-neutral-800 hover:bg-neutral-800'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isAuthenticated ? 'bg-emerald-400' : needsReconnect ? 'bg-amber-400 animate-ping' : 'bg-neutral-600'
                }`}
              />
              <span className="text-xs">
                {isAuthenticated ? (user?.displayName ? user.displayName.split(' ')[0] : 'Connected') : 'Connect'}
              </span>
            </button>

            {/* Settings Button (min 44px tap target) */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 border border-neutral-800 text-neutral-300 hover:text-white cursor-pointer transition-colors"
              title="Settings & Synchronization"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Document Library Home Screen */}
        <DocumentList
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSelectDoc={(doc) => setSelectedDoc(doc)}
        />
      </main>

      {/* Image Compression & Upload-Size Modal */}
      <ImageCompressModal
        doc={selectedDoc}
        isOpen={!!selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />

      {/* Settings & Synchronization Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-neutral-800/60 py-4 text-center text-xs text-neutral-500">
        Personal Document Manager &bull; $0 Forever &bull; Strictly Read-Only
      </footer>
    </div>
  );
};

export default App;
