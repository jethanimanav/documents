import React from 'react';
import { RefreshCw, HardDrive, AlertTriangle, WifiOff, CheckCircle2 } from 'lucide-react';

interface DriveStatusCardProps {
  isAuthenticated: boolean;
  needsReconnect: boolean;
  isOnline: boolean;
  docCount: number;
  isSyncing: boolean;
  lastSyncTime?: number;
  onReconnect: () => void;
  onSync: () => void;
  onOpenSettings: () => void;
}

export const DriveStatusCard: React.FC<DriveStatusCardProps> = ({
  isAuthenticated,
  needsReconnect,
  isOnline,
  docCount,
  isSyncing,
  lastSyncTime,
  onReconnect,
  onSync,
  onOpenSettings,
}) => {
  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const diffSec = Math.floor((Date.now() - timestamp) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // 1. Offline State
  if (!isOnline) {
    return (
      <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
            <WifiOff className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-950 flex items-center gap-1.5 leading-tight">
              <span>Offline Mode</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-200/80 text-amber-800">
                Cache Active
              </span>
            </p>
            <p className="text-[11px] text-amber-800/90 mt-0.5 truncate">
              {docCount} cached {docCount === 1 ? 'document' : 'documents'} searchable locally
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Reconnect Required State
  if (needsReconnect) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-neutral-900 leading-tight">
              Google Drive Session Expired
            </p>
            <p className="text-[11px] text-neutral-600 mt-0.5 truncate">
              Tap Reconnect to refresh credentials & sync
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReconnect}
          className="min-h-[38px] px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer shadow-xs transition-colors"
        >
          Reconnect
        </button>
      </div>
    );
  }

  // 3. Disconnected / Needs Setup
  if (!isAuthenticated) {
    return (
      <div className="bg-white/80 backdrop-blur-md border border-neutral-200/70 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
            <HardDrive className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-neutral-900 leading-tight">
              Google Drive
            </p>
            <p className="text-[11px] text-neutral-500 mt-0.5 truncate">
              Connect to sync and index your document folder
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="min-h-[38px] px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer shadow-xs transition-colors"
        >
          Connect Drive
        </button>
      </div>
    );
  }

  // 4. Connected & Healthy State
  return (
    <div className="bg-white/80 backdrop-blur-md border border-neutral-200/60 rounded-2xl p-3.5 flex items-center justify-between gap-3 shadow-xs">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0">
          <HardDrive className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-neutral-900 leading-tight">Google Drive</p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
              Connected
            </span>
          </div>
          <p className="text-[11px] text-neutral-500 mt-0.5 truncate font-medium">
            {isSyncing
              ? 'Crawling root folder tree...'
              : `Last synced: ${formatLastSync(lastSyncTime)} · ${docCount} ${docCount === 1 ? 'doc' : 'docs'} ready`}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onSync}
        disabled={isSyncing}
        aria-label="Resync documents from Google Drive"
        className="min-h-[36px] px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200/80 active:bg-neutral-200 text-neutral-700 text-xs font-medium shrink-0 cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-1.5"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-orange-500' : 'text-neutral-500'}`} />
        <span className="hidden sm:inline">{isSyncing ? 'Syncing' : 'Resync'}</span>
      </button>
    </div>
  );
};
