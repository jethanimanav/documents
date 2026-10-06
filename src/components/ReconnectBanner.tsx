import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export const ReconnectBanner: React.FC = () => {
  const { needsReconnect, reconnect, isIOSStandalone } = useAuth();

  if (!needsReconnect) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-black px-4 py-3 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-600/30 rounded-full shrink-0">
          <AlertTriangle className="w-5 h-5 text-black" />
        </div>
        <div>
          <p className="font-semibold text-sm leading-tight">Google Drive Session Reconnect Needed</p>
          <p className="text-xs opacity-90 leading-tight">
            Tokens expire after ~1 hour. Tap Reconnect to refresh credentials and continue.
          </p>
          {isIOSStandalone && (
            <p className="text-xs font-medium text-amber-950 mt-0.5">
              iOS Standalone detected. If popup is blocked, open in Safari to re-authenticate.
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={reconnect}
        className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-black text-white hover:bg-neutral-800 active:bg-neutral-900 rounded-lg font-medium text-sm flex items-center justify-center gap-2 cursor-pointer shadow transition-colors shrink-0"
      >
        <RefreshCw className="w-4 h-4" />
        Reconnect Google
      </button>
    </div>
  );
};
