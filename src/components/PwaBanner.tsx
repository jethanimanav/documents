import React, { useState, useEffect } from 'react';
import { RefreshCw, Download, X, CheckCircle2, Share2, Smartphone } from 'lucide-react';

interface PwaBannerProps {
  needRefresh: boolean;
  offlineReady: boolean;
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  onUpdate: () => void;
  onDismissRefresh: () => void;
  onPromptInstall: () => Promise<boolean>;
}

export const PwaBanner: React.FC<PwaBannerProps> = ({
  needRefresh,
  offlineReady,
  isInstallable,
  isStandalone,
  isIOS,
  onUpdate,
  onDismissRefresh,
  onPromptInstall,
}) => {
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed the install banner in this session
    const isDismissed = sessionStorage.getItem('pwa_install_dismissed') === 'true';
    if (!isDismissed && isInstallable && !isStandalone) {
      setShowInstallBanner(true);
    }
  }, [isInstallable, isStandalone]);

  const handleDismissInstall = () => {
    setShowInstallBanner(false);
    sessionStorage.setItem('pwa_install_dismissed', 'true');
  };

  const handleInstallClick = async () => {
    if (isInstallable) {
      const installed = await onPromptInstall();
      if (installed) {
        setShowInstallBanner(false);
      }
    } else if (isIOS && !isStandalone) {
      setShowIosGuide(true);
    }
  };

  const handleUpdateClick = () => {
    setIsUpdating(true);
    onUpdate();
  };

  return (
    <>
      {/* 1. Update Available Banner */}
      {needRefresh && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed top-20 right-4 left-4 sm:left-auto sm:max-w-md z-50 bg-neutral-900/95 backdrop-blur-md border border-orange-500/40 text-neutral-100 rounded-2xl p-4 shadow-2xl animate-in slide-in-from-top-4 duration-200"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <RefreshCw className={`w-4 h-4 ${isUpdating ? 'animate-spin' : ''}`} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-white">App Update Available</h4>
              <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                A new version of Personal Docs is ready. Refresh now to apply updates without losing cached metadata.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={handleUpdateClick}
                  disabled={isUpdating}
                  className="px-3.5 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-md shadow-orange-500/25 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                  <span>{isUpdating ? 'Updating...' : 'Update Now'}</span>
                </button>
                <button
                  type="button"
                  onClick={onDismissRefresh}
                  className="px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold text-xs cursor-pointer transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissRefresh}
              aria-label="Dismiss update notification"
              className="text-neutral-400 hover:text-white p-1 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}

      {/* 2. Offline Ready Notification */}
      {offlineReady && (
        <aside
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-xs z-50 bg-neutral-900/95 backdrop-blur-md border border-emerald-500/40 text-neutral-100 rounded-2xl p-3 shadow-xl animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-xs font-semibold text-neutral-200">
              Personal Docs is ready for offline use.
            </p>
          </div>
        </aside>
      )}

      {/* 3. Install App Banner (Promptable browsers like Chrome / Edge / Android) */}
      {showInstallBanner && !needRefresh && (
        <aside
          role="region"
          aria-label="App installation promotion"
          className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 bg-neutral-900/95 backdrop-blur-md border border-neutral-700/80 text-neutral-100 rounded-2xl p-3.5 shadow-2xl animate-in slide-in-from-bottom-4 duration-200"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-white shrink-0 shadow-sm">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-xs text-white truncate">Install Personal Docs</p>
                <p className="text-[11px] text-neutral-400 truncate">Fast, full-screen mobile app</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 active:scale-95 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
              <button
                type="button"
                onClick={handleDismissInstall}
                aria-label="Dismiss install banner"
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* 4. iOS Safari Add to Home Screen Instructions Modal */}
      {showIosGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-guide-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl text-neutral-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 id="ios-guide-title" className="font-bold text-sm text-white">
                  Add to iPhone / iPad Home Screen
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowIosGuide(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed">
              Safari on iOS does not support one-click installation buttons. Follow these quick steps to install:
            </p>

            <ol className="space-y-2.5 text-xs text-neutral-300 list-decimal list-inside pl-1">
              <li className="leading-snug">
                Tap the <strong className="text-white">Share</strong> button{' '}
                <Share2 className="inline w-3.5 h-3.5 text-orange-400 align-text-bottom" /> in Safari’s toolbar.
              </li>
              <li className="leading-snug">
                Scroll down and tap <strong className="text-white">&ldquo;Add to Home Screen&rdquo;</strong>.
              </li>
              <li className="leading-snug">
                Tap <strong className="text-white">&ldquo;Add&rdquo;</strong> in the top-right corner.
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="w-full py-2.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
