import { useState, useEffect, useCallback, useMemo } from 'react';
import { db, getSetting, setSetting, setCategoryOverride } from '../services/db';
import {
  searchIndex,
  type SortOption,
  type FileTypeFilter,
  type SizeRangeFilter,
  type DateRangeFilter,
  getRecentSearchHistory,
  addRecentSearchQuery,
  clearRecentSearchHistory,
} from '../services/searchIndex';
import { driveSync, type SyncProgress } from '../services/driveSync';
import { useAuth } from './useAuth';
import type { DocItem, DocCategory } from '../types';

const SETTING_PINNED_IDS = 'pinned_doc_ids';
const SETTING_RECENT_IDS = 'recent_doc_ids';

export type SizeBracket = 'all' | 'under500kb' | '500kb-2mb' | '2mb-10mb' | 'over10mb';
export type DatePreset = 'all' | 'last7days' | 'last30days' | 'last90days' | 'thisYear';

export function useDocuments() {
  const { isAuthenticated } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocCategory | 'All'>('All');
  const [fileTypeFilter, setFileTypeFilter] = useState<FileTypeFilter>('all');
  const [sizeBracket, setSizeBracket] = useState<SizeBracket>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const [syncProgress, setSyncProgress] = useState<SyncProgress>(() => driveSync.getProgress());
  const [allDocs, setAllDocs] = useState<DocItem[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // 1. Instant Startup: Load cached metadata from Dexie on mount
  useEffect(() => {
    let isMounted = true;

    async function loadCache() {
      try {
        const cachedDocs = await db.docs.toArray();
        const storedPinned = await getSetting<string[]>(SETTING_PINNED_IDS, []);
        const storedRecent = await getSetting<string[]>(SETTING_RECENT_IDS, []);
        const storedHistory = await getRecentSearchHistory();

        if (isMounted) {
          // Initialize in-memory MiniSearch index immediately
          searchIndex.initialize(cachedDocs);
          setAllDocs(cachedDocs);
          setPinnedIds(storedPinned);
          setRecentIds(storedRecent);
          setRecentSearches(storedHistory);
          setIsLoaded(true);
        }
      } catch (err) {
        console.error('Failed to load local document cache:', err);
        if (isMounted) setIsLoaded(true);
      }
    }

    loadCache();

    // Subscribe to sync progress updates
    const unsubscribeSync = driveSync.subscribe((progress) => {
      if (isMounted) {
        setSyncProgress(progress);
        if (progress.status === 'synced' || progress.status === 'syncing') {
          // Refresh docs from in-memory search index
          setAllDocs(searchIndex.getAllDocs());
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribeSync();
    };
  }, []);

  // 2. Background Sync on boot if online and authenticated
  useEffect(() => {
    if (isLoaded && isAuthenticated && navigator.onLine) {
      // Trigger subtle background sync
      driveSync.sync(false).catch((err) => {
        console.warn('Background sync encountered an issue:', err);
      });
    }
  }, [isLoaded, isAuthenticated]);

  // Map sizeBracket to SizeRangeFilter
  const resolvedSizeRange = useMemo<SizeRangeFilter | undefined>(() => {
    switch (sizeBracket) {
      case 'under500kb':
        return { maxBytes: 500 * 1024 };
      case '500kb-2mb':
        return { minBytes: 500 * 1024, maxBytes: 2 * 1024 * 1024 };
      case '2mb-10mb':
        return { minBytes: 2 * 1024 * 1024, maxBytes: 10 * 1024 * 1024 };
      case 'over10mb':
        return { minBytes: 10 * 1024 * 1024 };
      default:
        return undefined;
    }
  }, [sizeBracket]);

  // Map datePreset to DateRangeFilter
  const resolvedDateRange = useMemo<DateRangeFilter | undefined>(() => {
    if (datePreset === 'all') return undefined;
    const now = new Date();
    let startDate: string | undefined;

    if (datePreset === 'last7days') {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate = d.toISOString().split('T')[0];
    } else if (datePreset === 'last30days') {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      startDate = d.toISOString().split('T')[0];
    } else if (datePreset === 'last90days') {
      const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      startDate = d.toISOString().split('T')[0];
    } else if (datePreset === 'thisYear') {
      startDate = `${now.getFullYear()}-01-01`;
    }

    return startDate ? { startDate } : undefined;
  }, [datePreset]);

  // Multi-filter search results
  const filteredDocs = useMemo(() => {
    return searchIndex.searchAdvanced({
      query: searchQuery,
      category: selectedCategory,
      fileType: fileTypeFilter,
      sizeRange: resolvedSizeRange,
      dateRange: resolvedDateRange,
      sortBy,
    });
  }, [
    searchQuery,
    selectedCategory,
    fileTypeFilter,
    resolvedSizeRange,
    resolvedDateRange,
    sortBy,
    allDocs,
  ]);

  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim().length > 0 ||
      selectedCategory !== 'All' ||
      fileTypeFilter !== 'all' ||
      sizeBracket !== 'all' ||
      datePreset !== 'all' ||
      sortBy !== 'default'
    );
  }, [searchQuery, selectedCategory, fileTypeFilter, sizeBracket, datePreset, sortBy]);

  const resetFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('All');
    setFileTypeFilter('all');
    setSizeBracket('all');
    setDatePreset('all');
    setSortBy('default');
  }, []);

  const saveSearchQuery = useCallback(async (query: string) => {
    const updated = await addRecentSearchQuery(query);
    setRecentSearches(updated);
  }, []);

  const clearHistory = useCallback(async () => {
    await clearRecentSearchHistory();
    setRecentSearches([]);
  }, []);

  // Pinned items
  const pinnedDocs = useMemo(() => {
    return pinnedIds
      .map((id) => searchIndex.getDoc(id))
      .filter((doc): doc is DocItem => doc !== undefined);
  }, [pinnedIds, allDocs]);

  // Recent items
  const recentDocs = useMemo(() => {
    return recentIds
      .filter((id) => !pinnedIds.includes(id)) // don't duplicate pinned in recent
      .map((id) => searchIndex.getDoc(id))
      .filter((doc): doc is DocItem => doc !== undefined)
      .slice(0, 8);
  }, [recentIds, pinnedIds, allDocs]);

  // Toggle pin
  const togglePin = useCallback(async (docId: string) => {
    setPinnedIds((prev) => {
      const next = prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId];
      setSetting(SETTING_PINNED_IDS, next);
      return next;
    });
  }, []);

  // Record viewed/recent
  const recordRecent = useCallback(async (docId: string) => {
    setRecentIds((prev) => {
      const filtered = prev.filter((id) => id !== docId);
      const next = [docId, ...filtered].slice(0, 10);
      setSetting(SETTING_RECENT_IDS, next);
      return next;
    });
  }, []);

  // Manual category override
  const updateCategory = useCallback(async (docId: string, category: DocCategory) => {
    await setCategoryOverride(docId, category);
    const updatedDoc = searchIndex.getDoc(docId);
    if (updatedDoc) {
      const newDoc = { ...updatedDoc, category };
      searchIndex.upsertDocs([newDoc]);
      setAllDocs(searchIndex.getAllDocs());
    }
  }, []);

  // Manual resync trigger
  const triggerSync = useCallback(async (forceFull: boolean = false) => {
    return driveSync.sync(forceFull);
  }, []);

  return {
    isLoaded,
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
    isPinned: (id: string) => pinnedIds.includes(id),
  };
}
