import React, { useState } from 'react';
import { RefreshCw, AlertTriangle, Settings } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface ReconnectBannerProps {
  onOpenSettings?: () => void;
}

export const ReconnectBanner: React.FC<ReconnectBannerProps> = ({ onOpenSettings }) => {
  const { needsReconnect, reconnect, isIOSStandalone, error, clientId } = useAuth();
  const [isReconnecting, setIsReconnecting] = useState(false);

  if (!needsReconnect) return null;

  const handleReconnect = async () => {
    console.log('[ReconnectBanner] "Reconnect Google" button clicked. Triggering reconnect flow...');
    setIsReconnecting(true);
    try {
      await reconnect();
    } finally {
      // Keep spinner briefly or until popup is dismissed/resolved
      setTimeout(() => setIsReconnecting(false), 2000);
    }
  };

  const isMissingClientId = !clientId || (error && error.toLowerCase().includes('client id'));

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-black px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-600/30 rounded-full shrink-0">
          <AlertTriangle className="w-5 h-5 text-black" />
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">Google Drive Session Reconnect Needed</p>
          <p className="text-xs opacity-90 leading-tight">
            Tokens expire after ~1 hour. Tap Reconnect to refresh credentials and continue.
          </p>
          {error && (
            <p className="text-xs font-semibold text-red-950 bg-amber-600/40 px-2 py-0.5 rounded mt-1 inline-block">
              {error}
            </p>
          )}
          {isIOSStandalone && (
            <p className="text-xs font-medium text-amber-950 mt-0.5">
              iOS Standalone detected. If popup is blocked, open in Safari to re-authenticate.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
        {isMissingClientId && onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 bg-amber-600/40 hover:bg-amber-600/60 active:bg-amber-600/80 text-black border border-amber-800/40 rounded-lg font-medium text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            Configure Client ID
          </button>
        )}

        <button
          type="button"
          onClick={handleReconnect}
          disabled={isReconnecting}
          className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-black text-white hover:bg-neutral-800 active:bg-neutral-900 rounded-lg font-medium text-sm flex items-center justify-center gap-2 cursor-pointer shadow transition-colors disabled:opacity-75"
        >
          <RefreshCw className={`w-4 h-4 ${isReconnecting ? 'animate-spin' : ''}`} />
          {isReconnecting ? 'Connecting...' : 'Reconnect Google'}
        </button>
      </div>
    </div>
  );
};
