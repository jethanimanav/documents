import React, { useRef, useEffect } from 'react';
import {
  Search,
  X,
  RefreshCw,
  Pin,
  Clock,
  FolderOpen,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { DocumentCard } from './DocumentCard';
import { useDocuments } from '../hooks/useDocuments';
import { ALL_CATEGORIES } from '../utils/category';
import type { DocItem } from '../types';

interface DocumentListProps {
  onOpenSettings: () => void;
  onSelectDoc?: (doc: DocItem) => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  onOpenSettings,
  onSelectDoc,
}) => {
  const {
    allDocs,
    filteredDocs,
    pinnedDocs,
    recentDocs,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    syncProgress,
    triggerSync,
    togglePin,
    recordRecent,
    updateCategory,
    isPinned,
  } = useDocuments();

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Autofocus search on desktop only (avoid keyboard popup on mobile)
  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const handleDocClick = (doc: DocItem) => {
    recordRecent(doc.id);
    onSelectDoc?.(doc);
  };

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

  const isSyncing = syncProgress.status === 'syncing';

  return (
    <div className="space-y-6">
      {/* Search Bar Header */}
      <div className="space-y-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-400">
            <Search className="w-5 h-5" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents, folders, tags..."
            className="w-full bg-neutral-900 border border-neutral-800 focus:border-blue-500 rounded-2xl pl-11 pr-10 py-3.5 text-base sm:text-lg text-white placeholder-neutral-500 outline-none transition-colors shadow-inner"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-400 hover:text-white cursor-pointer min-w-[44px] justify-center"
              title="Clear search"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Sync Status & Resync Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isSyncing ? 'bg-blue-400 animate-ping' : 'bg-emerald-400'
              }`}
            />
            <span>
              {isSyncing
                ? `Syncing (${syncProgress.docsDiscovered} docs found)...`
                : `Last synced: ${formatLastSync(syncProgress.lastSyncTime)}`}
            </span>
            <span className="text-neutral-600">&bull;</span>
            <span className="text-neutral-300 font-medium">
              {allDocs.length} {allDocs.length === 1 ? 'doc' : 'docs'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerSync(false)}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Resync'}</span>
            </button>
          </div>
        </div>

        {/* Live Progressive Sync Progress Bar */}
        {isSyncing && (
          <div className="bg-neutral-900 border border-blue-900/50 rounded-xl p-3.5 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="text-blue-300 font-medium flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                Crawling Google Drive root tree...
              </span>
              <span className="text-neutral-400 font-mono">
                {syncProgress.foldersDiscovered} folders &bull; {syncProgress.docsDiscovered} docs
              </span>
            </div>
            {syncProgress.currentFolder && (
              <p className="text-[11px] text-neutral-400 truncate font-mono">
                Folder: {syncProgress.currentFolder}
              </p>
            )}
            <div className="w-full bg-neutral-950 rounded-full h-1.5 overflow-hidden">
              <div className="bg-blue-500 h-1.5 rounded-full animate-pulse w-full" />
            </div>
          </div>
        )}

        {/* Sync Error Notice */}
        {syncProgress.status === 'error' && syncProgress.errorMessage && (
          <div className="bg-red-950/50 border border-red-800/60 rounded-xl p-3 text-xs text-red-300 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{syncProgress.errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="underline hover:text-white shrink-0 cursor-pointer"
            >
              Check Settings
            </button>
          </div>
        )}

        {/* Category Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-medium shrink-0 cursor-pointer transition-colors ${
              selectedCategory === 'All'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
            }`}
          >
            All ({allDocs.length})
          </button>
          {ALL_CATEGORIES.map((cat) => {
            const count = allDocs.filter((d) => d.category === cat).length;
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[36px] px-3.5 py-1.5 rounded-full text-xs font-medium shrink-0 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-neutral-900 text-neutral-400 hover:text-neutral-200 border border-neutral-800'
                }`}
              >
                {cat} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pinned & Recent Section (only show when no search filter active) */}
      {!searchQuery && selectedCategory === 'All' && (
        <div className="space-y-4">
          {/* Pinned Section */}
          {pinnedDocs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <Pin className="w-3.5 h-3.5 fill-amber-400" />
                <span>Pinned Documents</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pinnedDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    isPinned={true}
                    onTogglePin={togglePin}
                    onSelect={handleDocClick}
                    onUpdateCategory={updateCategory}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Recent Section */}
          {recentDocs.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                <Clock className="w-3.5 h-3.5" />
                <span>Recent Documents</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recentDocs.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    isPinned={isPinned(doc.id)}
                    onTogglePin={togglePin}
                    onSelect={handleDocClick}
                    onUpdateCategory={updateCategory}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Document Results List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <span className="font-semibold uppercase tracking-wider">
            {searchQuery
              ? `Search Results (${filteredDocs.length})`
              : selectedCategory !== 'All'
              ? `${selectedCategory} (${filteredDocs.length})`
              : `All Documents (${filteredDocs.length})`}
          </span>
        </div>

        {filteredDocs.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isPinned={isPinned(doc.id)}
                onTogglePin={togglePin}
                onSelect={handleDocClick}
                onUpdateCategory={updateCategory}
              />
            ))}
          </div>
        ) : (
          /* Empty States */
          <div className="bg-neutral-900/50 border border-neutral-800/80 rounded-2xl p-8 text-center space-y-3">
            {searchQuery ? (
              <>
                <div className="w-12 h-12 rounded-full bg-neutral-800 text-neutral-400 flex items-center justify-center mx-auto">
                  <Search className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-neutral-200">No documents found</h4>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  No documents matched &ldquo;{searchQuery}&rdquo;. Try another term, or check other categories.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Clear Search
                </button>
              </>
            ) : allDocs.length === 0 ? (
              <>
                <div className="w-12 h-12 rounded-full bg-blue-950/60 border border-blue-800 text-blue-400 flex items-center justify-center mx-auto">
                  <FolderOpen className="w-6 h-6" />
                </div>
                <h4 className="text-base font-semibold text-neutral-100">Document Library Empty</h4>
                <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                  Configure your Google Drive root folder in Settings and tap Sync to crawl your files.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="min-h-[44px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium cursor-pointer shadow flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Configure Root Folder
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-neutral-400">No documents found in category &ldquo;{selectedCategory}&rdquo;.</p>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-lg text-xs font-medium cursor-pointer mt-2"
                >
                  Show All Categories
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
