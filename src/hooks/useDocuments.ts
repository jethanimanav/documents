import { useState, useEffect, useCallback, useMemo } from 'react';
import { db, getSetting, setSetting, setCategoryOverride } from '../services/db';
import { searchIndex } from '../services/searchIndex';
import { driveSync, type SyncProgress } from '../services/driveSync';
import { useAuth } from './useAuth';
import type { DocItem, DocCategory } from '../types';

const SETTING_PINNED_IDS = 'pinned_doc_ids';
const SETTING_RECENT_IDS = 'recent_doc_ids';

export function useDocuments() {
  const { isAuthenticated } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocCategory | 'All'>('All');
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

        if (isMounted) {
          // Initialize in-memory MiniSearch index immediately
          searchIndex.initialize(cachedDocs);
          setAllDocs(cachedDocs);
          setPinnedIds(storedPinned);
          setRecentIds(storedRecent);
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

  // Instant in-memory search results
  const filteredDocs = useMemo(() => {
    return searchIndex.search(searchQuery, selectedCategory);
  }, [searchQuery, selectedCategory, allDocs]);

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
    syncProgress,
    triggerSync,
    togglePin,
    recordRecent,
    updateCategory,
    isPinned: (id: string) => pinnedIds.includes(id),
  };
}
