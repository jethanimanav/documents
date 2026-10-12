import React, { useState, useEffect } from 'react';
import {
  X,
  FolderSync,
  Save,
  RefreshCw,
  Folder,
  Layers,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Activity,
  Smartphone,
  Download,
  WifiOff,
  ShieldCheck,
  Share2,
} from 'lucide-react';
import { getSetting, setSetting } from '../services/db';
import {
  SETTING_ROOT_FOLDER_ID,
  SETTING_CATEGORY_RULES,
  SETTING_CHANGES_TOKEN,
  driveSync,
  type SyncProgress,
} from '../services/driveSync';
import { extractFolderId } from '../utils/folder';
import { DEFAULT_CATEGORY_RULES, ALL_CATEGORIES } from '../utils/category';
import { AuthCard } from './AuthCard';
import type { DocCategory } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
  isInstallable?: boolean;
  isStandalone?: boolean;
  isIOS?: boolean;
  onPromptInstall?: () => Promise<boolean>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted,
  isInstallable = false,
  isStandalone = false,
  isIOS = false,
  onPromptInstall,
}) => {
  const [rootFolderInput, setRootFolderInput] = useState('');
  const [categoryRules, setCategoryRules] = useState<Record<DocCategory, string[]>>(
    DEFAULT_CATEGORY_RULES
  );
  const [activeTab, setActiveTab] = useState<'folder' | 'categories' | 'auth' | 'pwa'>('folder');
  const [installedSuccess, setInstalledSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  // Sync diagnostics state (Milestone 5)
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(driveSync.getProgress());
  const [changesToken, setChangesToken] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const unsub = driveSync.subscribe(setSyncProgress);

      getSetting<string>(
        SETTING_ROOT_FOLDER_ID,
        'https://drive.google.com/drive/folders/1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC'
      ).then((val) => setRootFolderInput(val));

      getSetting<Record<DocCategory, string[]>>(
        SETTING_CATEGORY_RULES,
        DEFAULT_CATEGORY_RULES
      ).then((rules) => setCategoryRules(rules));

      getSetting<string>(SETTING_CHANGES_TOKEN, '').then(setChangesToken);

      return () => {
        unsub();
      };
    }
  }, [isOpen]);

  // Keyboard dismissal via Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const extractedId = extractFolderId(rootFolderInput);

  const handleSaveRootFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSyncMessage(null);
    try {
      await setSetting(SETTING_ROOT_FOLDER_ID, rootFolderInput.trim());
      setSyncMessage({ type: 'success', text: 'Root folder setting saved.' });
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err?.message || 'Failed to save root folder' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTriggerSync = async (forceFull: boolean) => {
    if (!navigator.onLine) {
      setSyncMessage({
        type: 'error',
        text: 'Cannot sync with Google Drive while offline. Please connect to the internet.',
      });
      return;
    }
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      await setSetting(SETTING_ROOT_FOLDER_ID, rootFolderInput.trim());
      await driveSync.sync(forceFull);
      setSyncMessage({
        type: 'success',
        text: forceFull
          ? 'Full crawl completed successfully!'
          : 'Incremental sync completed successfully!',
      });
      onSyncCompleted?.();
    } catch (err: any) {
      setSyncMessage({ type: 'error', text: err?.message || 'Sync failed.' });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveCategoryRules = async () => {
    setIsSaving(true);
    try {
      await setSetting(SETTING_CATEGORY_RULES, categoryRules);
      setSyncMessage({ type: 'success', text: 'Category keyword rules saved.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetCategoryRules = async () => {
    setCategoryRules(DEFAULT_CATEGORY_RULES);
    await setSetting(SETTING_CATEGORY_RULES, DEFAULT_CATEGORY_RULES);
    setSyncMessage({ type: 'success', text: 'Category rules reset to default.' });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-dialog-title"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-950/60 border border-blue-800/60 rounded-xl text-blue-400">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h2 id="settings-dialog-title" className="text-base font-semibold text-white">Settings & Synchronization</h2>
              <p className="text-xs text-neutral-400">Manage root folder, sync mode, & category rules</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 px-4 bg-neutral-950/40 text-xs overflow-x-auto scrollbar-none touch-pan-x">
          <button
            type="button"
            onClick={() => setActiveTab('folder')}
            className={`min-h-[44px] px-4 font-medium border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'folder'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Folder className="w-4 h-4" />
            Root Folder & Sync
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('categories')}
            className={`min-h-[44px] px-4 font-medium border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'categories'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            Category Rules
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('auth')}
            className={`min-h-[44px] px-4 font-medium border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'auth'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Privacy & Security
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pwa')}
            className={`min-h-[44px] px-4 font-medium border-b-2 cursor-pointer flex items-center gap-2 shrink-0 ${
              activeTab === 'pwa'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            Mobile & Offline
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {syncMessage && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 ${
                syncMessage.type === 'success'
                  ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-300'
                  : 'bg-red-950/50 border border-red-800 text-red-300'
              }`}
            >
              {syncMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <span>{syncMessage.text}</span>
            </div>
          )}

          {activeTab === 'folder' && (
            <div className="space-y-6">
              {/* Root Folder Form */}
              <form onSubmit={handleSaveRootFolder} className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Google Drive Root Folder URL or ID
                </label>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={rootFolderInput}
                    onChange={(e) => setRootFolderInput(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="w-full bg-neutral-950 border border-neutral-700 focus:border-blue-500 rounded-xl px-3.5 py-3 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors"
                  />
                  {extractedId && (
                    <div className="text-[11px] text-neutral-400 bg-neutral-950/70 p-2.5 rounded-lg border border-neutral-800 font-mono flex items-center justify-between">
                      <span>Parsed Folder ID:</span>
                      <strong className="text-blue-400 font-mono">{extractedId}</strong>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <p className="text-[11px] text-neutral-400">
                    The app will <strong className="text-neutral-200">ONLY index this folder tree</strong> and
                    its descendants. It will never scan your whole Drive.
                  </p>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="min-h-[44px] px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 rounded-xl text-xs font-medium cursor-pointer transition-colors shrink-0 flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Folder
                  </button>
                </div>
              </form>

              {/* Sync Actions */}
              <div className="border-t border-neutral-800 pt-5 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Synchronization Actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleTriggerSync(false)}
                    disabled={isSyncing || !extractedId}
                    className="min-h-[48px] p-3 bg-neutral-950 hover:bg-neutral-850 active:bg-neutral-900 border border-neutral-700 rounded-xl text-left cursor-pointer transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 font-medium text-xs text-white">
                      <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Incremental Sync</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1 leading-snug">
                      Uses Drive Changes API to quickly sync new or updated files without re-crawling.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTriggerSync(true)}
                    disabled={isSyncing || !extractedId}
                    className="min-h-[48px] p-3 bg-neutral-950 hover:bg-neutral-850 active:bg-neutral-900 border border-neutral-700 rounded-xl text-left cursor-pointer transition-all disabled:opacity-50"
                  >
                    <div className="flex items-center gap-2 font-medium text-xs text-amber-300">
                      <FolderSync className={`w-3.5 h-3.5 text-amber-400 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Full Resync (Tree Crawl)</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 mt-1 leading-snug">
                      Performs a breadth-first recursive walk of the entire root folder hierarchy.
                    </p>
                  </button>
                </div>
              </div>

              {/* Synchronization Diagnostics & Resilience (Milestone 5) */}
              <div className="border-t border-neutral-800 pt-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                    Sync Diagnostics & Resilience
                  </h3>
                </div>

                <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3.5 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                      <span className="text-[10px] text-neutral-400 block font-medium">Last Sync</span>
                      <span className="font-semibold text-neutral-200 mt-0.5 block truncate">
                        {syncProgress.lastSyncTime
                          ? new Date(syncProgress.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Never'}
                      </span>
                    </div>
                    <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                      <span className="text-[10px] text-neutral-400 block font-medium">Duration</span>
                      <span className="font-semibold text-neutral-200 mt-0.5 block">
                        {syncProgress.lastSyncDurationMs
                          ? `${(syncProgress.lastSyncDurationMs / 1000).toFixed(1)}s`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                      <span className="text-[10px] text-neutral-400 block font-medium">Items Scanned</span>
                      <span className="font-semibold text-neutral-200 mt-0.5 block">
                        {syncProgress.lastSyncItemsScanned ?? syncProgress.docsDiscovered ?? 0} docs
                      </span>
                    </div>
                  </div>

                  <div className="text-[11px] text-neutral-400 space-y-1.5 pt-2 border-t border-neutral-800/60">
                    <div className="flex items-center justify-between">
                      <span>Change Token Status:</span>
                      <span className="font-mono text-neutral-300">
                        {changesToken ? 'Active (Incremental ready)' : 'Not set (Initial crawl needed)'}
                      </span>
                    </div>
                    <p className="text-neutral-500 text-[10px] leading-snug">
                      Resilience Guarantee: If network disconnects midway through a sync, previously processed documents remain safely persisted.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-neutral-400">
                <p>Edit comma-separated keywords used to automatically categorize documents by filename.</p>
                <button
                  type="button"
                  onClick={handleResetCategoryRules}
                  className="text-neutral-400 hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              <div className="space-y-3">
                {ALL_CATEGORIES.filter((c) => c !== 'Other').map((category) => {
                  const keywords = categoryRules[category] || [];
                  return (
                    <div key={category} className="space-y-1 bg-neutral-950 p-3 rounded-xl border border-neutral-800">
                      <label className="text-xs font-semibold text-neutral-200">{category}</label>
                      <input
                        type="text"
                        value={keywords.join(', ')}
                        onChange={(e) => {
                          const val = e.target.value
                            .split(',')
                            .map((k) => k.trim())
                            .filter(Boolean);
                          setCategoryRules((prev) => ({
                            ...prev,
                            [category]: val,
                          }));
                        }}
                        className="w-full bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveCategoryRules}
                  disabled={isSaving}
                  className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium cursor-pointer transition-colors shadow flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  Save Category Rules
                </button>
              </div>
            </div>
          )}

          {activeTab === 'auth' && (
            <div>
              <AuthCard />
            </div>
          )}

          {activeTab === 'pwa' && (
            <div className="space-y-6">
              {/* PWA Mode Status Card */}
              <div className="bg-neutral-950 p-5 rounded-2xl border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-orange-950/60 border border-orange-800/60 rounded-xl text-orange-400">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-white">App Installation & Display</h3>
                      <p className="text-xs text-neutral-400">Progressive Web App status on this device</p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
                      isStandalone
                        ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800'
                        : 'bg-neutral-900 text-neutral-400 border-neutral-800'
                    }`}
                  >
                    {isStandalone ? 'Installed (Standalone)' : 'Web Browser Mode'}
                  </span>
                </div>

                {isInstallable && !isStandalone && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (onPromptInstall) {
                          const res = await onPromptInstall();
                          if (res) setInstalledSuccess(true);
                        }
                      }}
                      className="min-h-[44px] px-5 py-2.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-orange-500/20 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Install Personal Docs App</span>
                    </button>
                    {installedSuccess && (
                      <p className="text-xs text-emerald-400 mt-2 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Application successfully installed to your device!
                      </p>
                    )}
                  </div>
                )}

                {isIOS && !isStandalone && (
                  <div className="p-3.5 bg-neutral-900/80 border border-neutral-800 rounded-xl space-y-2 text-xs text-neutral-300">
                    <p className="font-semibold text-white">Installing on iOS (Safari):</p>
                    <ol className="list-decimal list-inside space-y-1 text-neutral-400 pl-1">
                      <li>Tap the <strong>Share</strong> icon <Share2 className="inline w-3 h-3 text-orange-400" /> in Safari’s navigation bar.</li>
                      <li>Scroll down and select <strong>&ldquo;Add to Home Screen&rdquo;</strong>.</li>
                      <li>Tap <strong>&ldquo;Add&rdquo;</strong> in the top-right corner to launch in full-screen standalone mode.</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* Offline Capability & Caching Architecture */}
              <div className="bg-neutral-950 p-5 rounded-2xl border border-neutral-800 space-y-3.5 text-xs">
                <div className="flex items-center gap-2.5 pb-2 border-b border-neutral-800">
                  <WifiOff className="w-4 h-4 text-amber-400" />
                  <h3 className="font-semibold text-sm text-white">Offline Capabilities & Limits</h3>
                </div>

                <div className="space-y-2 text-neutral-300 leading-relaxed">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p>
                      <strong>Application Shell & Assets:</strong> Precached by Workbox service worker for instant startup with zero internet connection.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p>
                      <strong>Document Library & Search:</strong> IndexedDB metadata and MiniSearch remain 100% functional offline for finding files, tags, and categories.
                    </p>
                  </div>
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <p>
                      <strong>Cache Storage Isolation:</strong> Personal document bytes, PDF contents, and Google OAuth tokens are <em>never</em> cached by the Service Worker (NetworkOnly enforcement).
                    </p>
                  </div>
                  <div className="flex items-start gap-2 text-amber-300/90 bg-amber-950/20 p-2.5 rounded-xl border border-amber-900/40">
                    <Activity className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p>
                      <strong>Internet Required:</strong> Downloading original files, executing Google Drive folder crawl/sync, and Google OAuth token refresh require an active network connection.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
