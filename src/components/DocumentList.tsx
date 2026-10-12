import React, { useRef, useState, useEffect } from 'react';
import {
  Search,
  X,
  Pin,
  Clock,
  FolderOpen,
  SlidersHorizontal,
  Layers,
  Sparkles,
  Calendar,
} from 'lucide-react';
import { DocumentCard } from './DocumentCard';
import { DriveStatusCard } from './DriveStatusCard';
import { DocumentOrbit } from './DocumentOrbit';
import { QuickActionSheet } from './QuickActionSheet';
import { useDocuments } from '../hooks/useDocuments';
import { useAuth } from '../hooks/useAuth';
import { ALL_CATEGORIES } from '../utils/category';
import { getAllDocumentDetails, type DocumentDetailRecord } from '../services/db';
import { calculateExpiryStatus, formatDisplayDate } from '../utils/documentDetails';
import type { DocItem } from '../types';

interface DocumentListProps {
  isOnline?: boolean;
  onOpenSettings: () => void;
  onSelectDoc?: (doc: DocItem, blob?: Blob) => void;
  onPrepareDoc?: (doc: DocItem, blob?: Blob) => void;
  onOpenMerge?: (doc?: DocItem, blob?: Blob) => void;
  onOpenManagePages?: (doc?: DocItem, blob?: Blob) => void;
  onOpenDetails?: (doc: DocItem) => void;
  onOpenImagesToPdf?: () => void;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  isOnline = true,
  onOpenSettings,
  onSelectDoc,
  onPrepareDoc,
  onOpenMerge,
  onOpenManagePages,
  onOpenDetails,
  onOpenImagesToPdf,
}) => {
  const { user, isAuthenticated, needsReconnect, reconnect } = useAuth();
  const {
    allDocs,
    filteredDocs,
    pinnedDocs,
    recentDocs,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    fileTypeFilter,
    setFileTypeFilter,
    sizeBracket,
    setSizeBracket,
    datePreset,
    setDatePreset,
    sortBy,
    setSortBy,
    hasActiveFilters,
    resetFilters,
    recentSearches,
    saveSearchQuery,
    clearHistory,
    syncProgress,
    triggerSync,
    togglePin,
    recordRecent,
    updateCategory,
    isPinned,
  } = useDocuments();

  const searchInputRef = useRef<HTMLInputElement>(null);
  const librarySectionRef = useRef<HTMLDivElement>(null);
  const [showAllRecents, setShowAllRecents] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);

  // Document details & expiry reminders state (Milestone 3)
  const [reminderRecords, setReminderRecords] = useState<DocumentDetailRecord[]>([]);

  useEffect(() => {
    let isMounted = true;
    getAllDocumentDetails().then((records) => {
      if (isMounted) setReminderRecords(records);
    });
    return () => {
      isMounted = false;
    };
  }, [allDocs]);

  const activeReminders = React.useMemo(() => {
    return reminderRecords
      .filter((r) => r.expiryDate && !r.isDismissed)
      .map((r) => {
        const found = allDocs.find((d) => d.id === r.fileId);
        const docItem: DocItem = found || {
          id: r.fileId,
          name: 'Archived Document',
          cleanTitle: 'Document (No longer in Drive)',
          folderPath: 'Local Notes',
          parentId: '',
          category: 'Other',
          mimeType: 'text/plain',
          size: 0,
          modifiedTime: '',
        };
        const calc = calculateExpiryStatus(r.expiryDate, r.reminderLeadDays ?? 30);
        return { record: r, doc: docItem, calc };
      })
      .filter((item) => item.calc.status === 'expired' || item.calc.status === 'upcoming')
      .sort((a, b) => a.calc.daysRemaining - b.calc.daysRemaining);
  }, [reminderRecords, allDocs]);

  // Window drag management for file drops
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const windowDragCounter = useRef(0);

  React.useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      if (
        e.dataTransfer &&
        (Array.from(e.dataTransfer.types).includes('Files') ||
          Array.from(e.dataTransfer.types).includes('application/x-personal-doc-id'))
      ) {
        e.preventDefault();
        windowDragCounter.current += 1;
        setIsWindowDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      windowDragCounter.current -= 1;
      if (windowDragCounter.current <= 0) {
        windowDragCounter.current = 0;
        setIsWindowDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      if (
        e.dataTransfer &&
        (Array.from(e.dataTransfer.types).includes('Files') ||
          Array.from(e.dataTransfer.types).includes('application/x-personal-doc-id'))
      ) {
        e.preventDefault();
      }
    };

    const handleDrop = (e: DragEvent) => {
      windowDragCounter.current = 0;
      setIsWindowDragging(false);
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        windowDragCounter.current = 0;
        setIsWindowDragging(false);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Time-of-day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const displayName = user?.displayName ? user.displayName.split(' ')[0] : 'there';

  const handleDocClick = (doc: DocItem) => {
    recordRecent(doc.id);
    onSelectDoc?.(doc);
  };

  const scrollToLibrary = () => {
    if (librarySectionRef.current) {
      librarySectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCompressOrbit = () => {
    if (recentDocs.length > 0) {
      handleDocClick(recentDocs[0]);
    } else if (allDocs.length > 0) {
      handleDocClick(allDocs[0]);
    } else {
      setIsQuickActionOpen(true);
    }
  };

  const handleEditPagesOrbit = () => {
    const firstPdf = allDocs.find(
      (d) => d.mimeType === 'application/pdf' || /\.pdf$/i.test(d.name)
    );
    if (firstPdf) {
      handleDocClick(firstPdf);
    } else {
      setIsQuickActionOpen(true);
    }
  };

  const isSyncing = syncProgress.status === 'syncing';

  // Visible recent items limit
  const visibleRecentDocs = showAllRecents ? recentDocs : recentDocs.slice(0, 4);

  return (
    <div className="space-y-6 sm:space-y-7 pb-24">
      {/* 1. Hero Greeting Area */}
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-neutral-900 leading-tight">
          {getGreeting()},<br />
          <span className="text-neutral-900">{displayName} 👋</span>
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500 font-medium">
          Your documents, organized and ready.
        </p>
      </div>

      {/* 2. Prominent Search Field with Filter Toggle & History */}
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-400">
            <Search className="w-5 h-5 text-neutral-500" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                saveSearchQuery(searchQuery.trim());
              }
            }}
            placeholder="Search documents, folders, tags..."
            aria-label="Search documents by name, folder, or tag"
            enterKeyHint="search"
            className="w-full bg-white border border-neutral-200/80 focus:border-orange-500 focus:ring-4 focus:ring-orange-500/10 rounded-2xl pl-12 pr-24 py-3.5 sm:py-4 text-sm sm:text-base text-neutral-900 placeholder-neutral-400 outline-none transition-all shadow-[0_2px_12px_rgba(0,0,0,0.03)]"
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-neutral-400 hover:text-neutral-700 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl cursor-pointer transition-colors"
                title="Clear search"
                aria-label="Clear search input"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen((prev) => !prev)}
              aria-label="Toggle advanced filters"
              aria-expanded={isFilterDrawerOpen}
              className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl cursor-pointer transition-all ${
                hasActiveFilters || isFilterDrawerOpen
                  ? 'bg-orange-50 text-orange-600 border border-orange-200 shadow-xs'
                  : 'text-neutral-500 hover:bg-neutral-100'
              }`}
              title="Advanced search filters"
            >
              <SlidersHorizontal className="w-4 h-4" />
              {hasActiveFilters && (
                <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-white" />
              )}
            </button>
          </div>
        </div>

        {/* Quick Filter Shortcuts Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs touch-pan-x">
          <span className="text-neutral-400 font-semibold px-1 text-[11px] shrink-0">Quick:</span>
          <button
            type="button"
            onClick={() => setFileTypeFilter((prev) => (prev === 'pdf' ? 'all' : 'pdf'))}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl font-semibold shrink-0 cursor-pointer transition-all ${
              fileTypeFilter === 'pdf'
                ? 'bg-rose-100 text-rose-800 border border-rose-300'
                : 'bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200/80'
            }`}
          >
            PDFs
          </button>
          <button
            type="button"
            onClick={() => setFileTypeFilter((prev) => (prev === 'image' ? 'all' : 'image'))}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl font-semibold shrink-0 cursor-pointer transition-all ${
              fileTypeFilter === 'image'
                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                : 'bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200/80'
            }`}
          >
            Images
          </button>
          <button
            type="button"
            onClick={() => setDatePreset((prev) => (prev === 'last30days' ? 'all' : 'last30days'))}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl font-semibold shrink-0 cursor-pointer transition-all ${
              datePreset === 'last30days'
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                : 'bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200/80'
            }`}
          >
            Recent (30d)
          </button>
          <button
            type="button"
            onClick={() => setSizeBracket((prev) => (prev === 'over10mb' ? 'all' : 'over10mb'))}
            className={`min-h-[36px] px-3 py-1.5 rounded-xl font-semibold shrink-0 cursor-pointer transition-all ${
              sizeBracket === 'over10mb'
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200/80'
            }`}
          >
            Large (&gt;10MB)
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto text-orange-600 hover:text-orange-700 font-bold min-h-[36px] px-2.5 py-1.5 cursor-pointer shrink-0"
            >
              Reset all
            </button>
          )}
        </div>

        {/* Recent Search Queries (shown when no active search text) */}
        {!searchQuery && recentSearches.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs text-neutral-500">
            <span className="text-neutral-400 font-medium px-1 text-[11px] shrink-0">Recent:</span>
            {recentSearches.map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => setSearchQuery(query)}
                className="px-2 py-0.5 rounded-md bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-medium shrink-0 cursor-pointer transition-colors"
              >
                {query}
              </button>
            ))}
            <button
              type="button"
              onClick={clearHistory}
              className="text-[11px] text-neutral-400 hover:text-neutral-600 px-1.5 py-0.5 cursor-pointer ml-auto shrink-0"
              title="Clear search history"
            >
              Clear
            </button>
          </div>
        )}

        {/* Expandable Advanced Filter Drawer */}
        {isFilterDrawerOpen && (
          <div className="bg-white border border-neutral-200/80 rounded-2xl p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center justify-between pb-1 border-b border-neutral-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                Advanced Filters & Sorting
              </h3>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer"
                >
                  Clear all filters
                </button>
              )}
            </div>

            {/* File Type Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-600">File Type</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'All Types' },
                  { id: 'pdf', label: 'PDFs' },
                  { id: 'image', label: 'Images' },
                  { id: 'spreadsheet', label: 'Spreadsheets' },
                  { id: 'document', label: 'Documents' },
                  { id: 'other', label: 'Other' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setFileTypeFilter(item.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      fileTypeFilter === item.id
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Size Bracket Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-600">File Size</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'Any Size' },
                  { id: 'under500kb', label: '< 500 KB' },
                  { id: '500kb-2mb', label: '500 KB – 2 MB' },
                  { id: '2mb-10mb', label: '2 – 10 MB' },
                  { id: 'over10mb', label: '> 10 MB' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSizeBracket(item.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      sizeBracket === item.id
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date Modified Preset Filter */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-600">Modified Date</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'all', label: 'Any Time' },
                  { id: 'last7days', label: 'Last 7 days' },
                  { id: 'last30days', label: 'Last 30 days' },
                  { id: 'last90days', label: 'Last 90 days' },
                  { id: 'thisYear', label: 'This year' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDatePreset(item.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      datePreset === item.id
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sort Order Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-600">Sort By</label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'default', label: 'Relevance / Default' },
                  { id: 'newest', label: 'Newest First' },
                  { id: 'oldest', label: 'Oldest First' },
                  { id: 'name_asc', label: 'Name (A → Z)' },
                  { id: 'name_desc', label: 'Name (Z → A)' },
                  { id: 'smallest', label: 'Smallest First' },
                  { id: 'largest', label: 'Largest First' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSortBy(item.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      sortBy === item.id
                        ? 'bg-orange-500 text-white'
                        : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Google Drive Connection Status Card */}
      <DriveStatusCard
        isAuthenticated={isAuthenticated}
        needsReconnect={needsReconnect}
        isOnline={isOnline}
        docCount={allDocs.length}
        isSyncing={isSyncing}
        lastSyncTime={syncProgress.lastSyncTime}
        onReconnect={reconnect}
        onSync={() => triggerSync(false)}
        onOpenSettings={onOpenSettings}
      />

      {/* 4. Quick Action Hub: Document Orbit */}
      {!searchQuery && selectedCategory === 'All' && (
        <section aria-label="Quick document actions" className="py-1">
          <DocumentOrbit
            onPrepareClick={() => setIsQuickActionOpen(true)}
            onCompressClick={handleCompressOrbit}
            onMergeClick={(doc, blob) => onOpenMerge?.(doc, blob)}
            onEditPagesClick={(doc, blob) =>
              doc && onOpenManagePages ? onOpenManagePages(doc, blob) : handleEditPagesOrbit()
            }
            onBrowseClick={scrollToLibrary}
            onPrepareDoc={(doc, blob) => {
              recordRecent(doc.id);
              if (onPrepareDoc) {
                onPrepareDoc(doc, blob);
              } else {
                onSelectDoc?.(doc, blob);
              }
            }}
            allDocs={allDocs}
            isWindowDragging={isWindowDragging}
          />
        </section>
      )}

      {/* 5. Expiry Reminders Dashboard Section (Milestone 3) */}
      {!searchQuery && selectedCategory === 'All' && activeReminders.length > 0 && (
        <section aria-label="Upcoming document expiries" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                <Calendar className="w-3.5 h-3.5 text-orange-600" />
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                Upcoming Expiries & Renewals ({activeReminders.length})
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeReminders.map(({ record, doc, calc }) => (
              <div
                key={record.fileId}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-xs transition-all ${
                  calc.status === 'expired'
                    ? 'bg-rose-50/80 border-rose-200 text-rose-900'
                    : 'bg-amber-50/80 border-amber-200 text-amber-900'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        calc.status === 'expired'
                          ? 'bg-rose-200 text-rose-800'
                          : 'bg-amber-200 text-amber-800'
                      }`}
                    >
                      {calc.label}
                    </span>
                    <span className="text-[11px] text-neutral-500 font-mono">
                      {formatDisplayDate(record.expiryDate)}
                    </span>
                  </div>
                  <p className="font-bold text-neutral-900 truncate mt-1">{doc.cleanTitle}</p>
                  {record.notes && (
                    <p className="text-[11px] text-neutral-600 truncate mt-0.5 italic">
                      &ldquo;{record.notes}&rdquo;
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenDetails?.(doc)}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-800 font-bold text-xs cursor-pointer shadow-xs transition-colors"
                  >
                    View / Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 6. Pinned Documents (when not actively searching) */}
      {!searchQuery && selectedCategory === 'All' && pinnedDocs.length > 0 && (
        <section aria-label="Pinned documents" className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Pin className="w-3 h-3 fill-amber-500 text-amber-600" />
            </span>
            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-700">
              Pinned Documents ({pinnedDocs.length})
            </h2>
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
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </section>
      )}

      {/* 7. Recent Documents (when not actively searching) */}
      {!searchQuery && selectedCategory === 'All' && recentDocs.length > 0 && (
        <section aria-label="Recent documents" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-md bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
                <Clock className="w-3 h-3" />
              </span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-700">
                Recent Documents
              </h2>
            </div>
            {recentDocs.length > 4 && (
              <button
                type="button"
                onClick={() => setShowAllRecents((v) => !v)}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer"
              >
                {showAllRecents ? 'Show less' : 'See all'}
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleRecentDocs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                isPinned={isPinned(doc.id)}
                onTogglePin={togglePin}
                onSelect={handleDocClick}
                onUpdateCategory={updateCategory}
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        </section>
      )}

      {/* 7. Category Filter Chips & Library Section */}
      <section ref={librarySectionRef} aria-label="Document library" className="space-y-4 pt-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-neutral-900 tracking-tight">
            {searchQuery
              ? `Search Results (${filteredDocs.length})`
              : selectedCategory !== 'All'
              ? `${selectedCategory} (${filteredDocs.length})`
              : `All Documents (${allDocs.length})`}
          </h2>
          {onOpenMerge && allDocs.length > 1 && (
            <button
              type="button"
              onClick={() => onOpenMerge()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100/80 active:bg-rose-200 border border-rose-200/70 text-rose-800 text-xs font-semibold cursor-pointer transition-colors shadow-xs"
            >
              <Layers className="w-3.5 h-3.5 text-rose-600" />
              <span>Merge PDFs</span>
            </button>
          )}
        </div>

        {/* Category Horizontal Filter Chips */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4 sm:mx-0 sm:px-0">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            aria-label={`Show all documents (${allDocs.length})`}
            className={`min-h-[38px] px-4 py-1.5 rounded-full text-xs font-bold shrink-0 cursor-pointer transition-all ${
              selectedCategory === 'All'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-white text-neutral-600 hover:text-neutral-900 border border-neutral-200/80 hover:bg-neutral-50'
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
                aria-label={`Filter by category: ${cat}${count > 0 ? ` (${count})` : ''}`}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-white text-neutral-600 hover:text-neutral-900 border border-neutral-200/80 hover:bg-neutral-50'
                }`}
              >
                {cat} {count > 0 ? `(${count})` : ''}
              </button>
            );
          })}
        </div>

        {/* Document Cards Grid */}
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
                onOpenDetails={onOpenDetails}
              />
            ))}
          </div>
        ) : (
          /* Friendly Visual Empty States */
          <div className="bg-white/80 backdrop-blur-xs border border-neutral-200/80 rounded-3xl p-8 sm:p-10 text-center space-y-4 shadow-xs">
            {searchQuery ? (
              <>
                <div className="w-14 h-14 rounded-2xl bg-orange-50 text-orange-600 flex items-center justify-center mx-auto border border-orange-100">
                  <Search className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-neutral-900">No documents found</h3>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                    We couldn&apos;t find any files matching &ldquo;{searchQuery}&rdquo;. Try another term or clear the filter.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="min-h-[40px] px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs transition-colors"
                >
                  Clear Search
                </button>
              </>
            ) : allDocs.length === 0 ? (
              <>
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-emerald-100 to-teal-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-xs">
                  <FolderOpen className="w-8 h-8 stroke-[2]" />
                </div>
                <div className="space-y-1 max-w-sm mx-auto">
                  <h3 className="text-lg font-bold text-neutral-900">Your document space is ready!</h3>
                  <p className="text-xs text-neutral-500">
                    Connect your Google Drive root folder to see your files, optimize upload sizes, and manage documents.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="min-h-[44px] px-6 py-2.5 bg-gradient-to-tr from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-95 text-white rounded-2xl text-xs font-bold cursor-pointer shadow-md shadow-orange-500/20 inline-flex items-center gap-2 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Configure Google Drive Folder</span>
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-neutral-500 font-medium">
                  No documents found under &ldquo;{selectedCategory}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('All')}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                >
                  Show All Categories
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {/* Quick Action Drawer / Sheet Modal */}
      <QuickActionSheet
        isOpen={isQuickActionOpen}
        onClose={() => setIsQuickActionOpen(false)}
        recentDocs={recentDocs}
        onSelectDoc={handleDocClick}
        onOpenMerge={() => onOpenMerge?.()}
        onOpenImagesToPdf={onOpenImagesToPdf}
        onBrowseFiles={scrollToLibrary}
      />
    </div>
  );
};
