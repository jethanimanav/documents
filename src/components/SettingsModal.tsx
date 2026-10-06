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
} from 'lucide-react';
import { getSetting, setSetting } from '../services/db';
import {
  SETTING_ROOT_FOLDER_ID,
  SETTING_CATEGORY_RULES,
  driveSync,
} from '../services/driveSync';
import { extractFolderId } from '../utils/folder';
import { DEFAULT_CATEGORY_RULES, ALL_CATEGORIES } from '../utils/category';
import { AuthCard } from './AuthCard';
import type { DocCategory } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncCompleted?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSyncCompleted,
}) => {
  const [rootFolderInput, setRootFolderInput] = useState('');
  const [categoryRules, setCategoryRules] = useState<Record<DocCategory, string[]>>(
    DEFAULT_CATEGORY_RULES
  );
  const [activeTab, setActiveTab] = useState<'folder' | 'categories' | 'auth'>('folder');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    if (isOpen) {
      getSetting<string>(
        SETTING_ROOT_FOLDER_ID,
        'https://drive.google.com/drive/folders/1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC'
      ).then((val) => setRootFolderInput(val));

      getSetting<Record<DocCategory, string[]>>(
        SETTING_CATEGORY_RULES,
        DEFAULT_CATEGORY_RULES
      ).then((rules) => setCategoryRules(rules));
    }
  }, [isOpen]);

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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-950/60 border border-blue-800/60 rounded-xl text-blue-400">
              <FolderSync className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Settings & Synchronization</h2>
              <p className="text-xs text-neutral-400">Manage root folder, sync mode, & category rules</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 px-4 bg-neutral-950/40 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab('folder')}
            className={`min-h-[44px] px-4 font-medium border-b-2 cursor-pointer flex items-center gap-2 ${
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
            className={`min-h-[44px] px-4 font-medium border-b-2 cursor-pointer flex items-center gap-2 ${
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
            className={`min-h-[44px] px-4 font-medium border-b-2 cursor-pointer flex items-center gap-2 ${
              activeTab === 'auth'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            OAuth & Security
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
        </div>
      </div>
    </div>
  );
};
