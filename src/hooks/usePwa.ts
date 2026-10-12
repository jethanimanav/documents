import { useState, useEffect, useCallback, useRef } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface UsePwaReturn {
  needRefresh: boolean;
  offlineReady: boolean;
  isInstallable: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  dismissRefresh: () => void;
  promptInstall: () => Promise<boolean>;
}

export function usePwa(): UsePwaReturn {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  const updateSwFnRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  // Check standalone mode and iOS environment
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const checkStandalone = () => {
      const isStandaloneMode =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      setIsStandalone(Boolean(isStandaloneMode));
    };

    const isIosDevice =
      /iPad|iPhone|iPod/.test(navigator.userAgent || '') ||
      (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
    setIsIOS(Boolean(isIosDevice));

    checkStandalone();

    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener?.('change', checkStandalone);

    // Listen for beforeinstallprompt (Android / Chromium)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setIsInstallable(true);
    };

    // Listen for appinstalled
    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setIsInstallable(false);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      media.removeEventListener?.('change', checkStandalone);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // Register service worker with prompt mode
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    let isMounted = true;

    async function initServiceWorker() {
      try {
        // Dynamically import virtual:pwa-register
        const { registerSW } = await import('virtual:pwa-register');
        if (!isMounted) return;

        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            if (isMounted) setNeedRefresh(true);
          },
          onOfflineReady() {
            if (isMounted) {
              setOfflineReady(true);
              setTimeout(() => {
                if (isMounted) setOfflineReady(false);
              }, 4000);
            }
          },
        });

        updateSwFnRef.current = updateSW;
      } catch (err) {
        // Module not found (e.g. unit tests or local dev without SW)
        console.debug('[usePwa] virtual:pwa-register note:', err);
      }
    }

    initServiceWorker();

    return () => {
      isMounted = false;
    };
  }, []);

  const updateServiceWorker = useCallback(async (reloadPage = true) => {
    if (updateSwFnRef.current) {
      await updateSwFnRef.current(reloadPage);
    }
  }, []);

  const dismissRefresh = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) return false;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstallable(false);
        deferredPromptRef.current = null;
        return true;
      }
    } catch (err) {
      console.warn('Install prompt failed:', err);
    }
    return false;
  }, []);

  return {
    needRefresh,
    offlineReady,
    isInstallable,
    isStandalone,
    isIOS,
    updateServiceWorker,
    dismissRefresh,
    promptInstall,
  };
}
