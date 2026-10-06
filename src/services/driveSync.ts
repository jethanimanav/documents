import { driveFetch } from './driveFetch';
import { db, getSetting, setSetting, putDocs, deleteDocs, getAllCategoryOverrides, type FolderRecord } from './db';
import { searchIndex } from './searchIndex';
import { extractFolderId, deriveCleanTitle, isSupportedDocType } from '../utils/folder';
import { determineCategory, DEFAULT_CATEGORY_RULES } from '../utils/category';
import type { DocItem, DocCategory } from '../types';

export const SETTING_ROOT_FOLDER_ID = 'root_folder_id';
export const SETTING_CHANGES_TOKEN = 'drive_changes_token';
export const SETTING_LAST_SYNC_TIME = 'last_sync_time';
export const SETTING_CATEGORY_RULES = 'category_rules';

export interface SyncProgress {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  foldersDiscovered: number;
  docsDiscovered: number;
  currentFolder?: string;
  errorMessage?: string;
  lastSyncTime?: number;
}

type SyncListener = (progress: SyncProgress) => void;

interface FolderQueueItem {
  id: string;
  name: string;
  path: string;
}

export class DriveSyncService {
  private progress: SyncProgress = {
    status: 'idle',
    foldersDiscovered: 0,
    docsDiscovered: 0,
  };
  private listeners: Set<SyncListener> = new Set();
  private isSyncing: boolean = false;

  constructor() {
    this.loadLastSyncTime();
  }

  private async loadLastSyncTime(): Promise<void> {
    const last = await getSetting<number>(SETTING_LAST_SYNC_TIME, 0);
    if (last) {
      this.progress.lastSyncTime = last;
      this.notify();
    }
  }

  public subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.progress);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const copy = { ...this.progress };
    this.listeners.forEach((l) => l(copy));
  }

  public getProgress(): SyncProgress {
    return { ...this.progress };
  }

  /**
   * Performs sync. If an incremental changes token exists, attempts
   * incremental sync first. If that fails or is absent, performs full crawl.
   */
  public async sync(forceFull: boolean = false): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const rootInput = await getSetting<string>(SETTING_ROOT_FOLDER_ID, '');
      const rootFolderId = extractFolderId(rootInput);

      if (!rootFolderId) {
        throw new Error('Please configure a valid Google Drive Root Folder ID or URL in Settings.');
      }

      const existingToken = await getSetting<string>(SETTING_CHANGES_TOKEN, '');

      if (!forceFull && existingToken) {
        try {
          const success = await this.performIncrementalSync(rootFolderId, existingToken);
          if (success) {
            this.progress.status = 'synced';
            this.progress.lastSyncTime = Date.now();
            await setSetting(SETTING_LAST_SYNC_TIME, this.progress.lastSyncTime);
            this.notify();
            return;
          }
        } catch (err) {
          console.warn('Incremental sync failed; falling back to full recursive walk:', err);
        }
      }

      // Perform full recursive walk
      await this.performFullSync(rootFolderId);
      this.progress.status = 'synced';
      this.progress.lastSyncTime = Date.now();
      await setSetting(SETTING_LAST_SYNC_TIME, this.progress.lastSyncTime);
      this.notify();
    } catch (err: any) {
      console.error('Sync failed:', err);
      this.progress.status = 'error';
      this.progress.errorMessage = err?.message || 'Sync failed';
      this.notify();
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Breadth-first recursive walk of the configured root folder and its descendants.
   */
  public async performFullSync(rootFolderId: string): Promise<void> {
    this.progress = {
      status: 'syncing',
      foldersDiscovered: 0,
      docsDiscovered: 0,
      currentFolder: 'Initializing...',
      lastSyncTime: this.progress.lastSyncTime,
    };
    this.notify();

    // 1. Verify root folder exists and fetch root name
    const rootRes = await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${rootFolderId}?fields=id,name,mimeType,trashed`
    );
    if (!rootRes.ok) {
      throw new Error(
        `Failed to access root folder (${rootFolderId}). HTTP ${rootRes.status}: ${rootRes.statusText}`
      );
    }
    const rootData = await rootRes.json();
    if (rootData.trashed) {
      throw new Error(`The configured root folder (${rootFolderId}) is in the trash.`);
    }

    const rootName = rootData.name || 'Root';
    const folderMap = new Map<string, FolderRecord>();
    folderMap.set(rootFolderId, {
      id: rootFolderId,
      name: rootName,
      path: rootName,
    });

    const categoryOverrides = await getAllCategoryOverrides();
    const categoryRules = await getSetting<Record<DocCategory, string[]>>(
      SETTING_CATEGORY_RULES,
      DEFAULT_CATEGORY_RULES
    );

    const folderQueue: FolderQueueItem[] = [
      { id: rootFolderId, name: rootName, path: rootName },
    ];

    let totalDocsCount = 0;
    let totalFoldersCount = 1;
    const discoveredDocIds = new Set<string>();

    const CONCURRENCY = 5;

    while (folderQueue.length > 0) {
      // Process batch of folders up to CONCURRENCY limit
      const currentBatch = folderQueue.splice(0, CONCURRENCY);

      await Promise.all(
        currentBatch.map(async (folder) => {
          this.progress.currentFolder = folder.path;
          this.notify();

          let pageToken: string | undefined = undefined;

          do {
            const query = encodeURIComponent(`'${folder.id}' in parents and trashed=false`);
            const fields = encodeURIComponent(
              'nextPageToken, files(id, name, mimeType, size, md5Checksum, modifiedTime, parents, thumbnailLink, trashed)'
            );
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=1000&fields=${fields}${
              pageToken ? `&pageToken=${pageToken}` : ''
            }`;

            const res = await driveFetch(url);
            if (!res.ok) {
              console.warn(`Error fetching children for folder ${folder.id}: ${res.statusText}`);
              break;
            }

            const data = await res.json();
            const files: any[] = data.files || [];
            pageToken = data.nextPageToken;

            const batchDocs: DocItem[] = [];

            for (const item of files) {
              if (item.trashed) continue;

              if (item.mimeType === 'application/vnd.google-apps.folder') {
                const childPath = `${folder.path} / ${item.name}`;
                folderMap.set(item.id, {
                  id: item.id,
                  name: item.name,
                  parentId: folder.id,
                  path: childPath,
                });
                folderQueue.push({
                  id: item.id,
                  name: item.name,
                  path: childPath,
                });
                totalFoldersCount++;
              } else if (isSupportedDocType(item.mimeType, item.name)) {
                const cleanTitle = deriveCleanTitle(item.name);
                const manualOverride = categoryOverrides.get(item.id);
                const category = determineCategory({
                  name: item.name,
                  cleanTitle,
                  folderPath: folder.path,
                  manualOverride,
                  rules: categoryRules,
                });

                // Parse string size safely to number
                const size = typeof item.size === 'string' ? parseInt(item.size, 10) || 0 : Number(item.size) || 0;

                const docItem: DocItem = {
                  id: item.id,
                  name: item.name,
                  cleanTitle,
                  folderPath: folder.path,
                  parentId: folder.id,
                  category,
                  mimeType: item.mimeType,
                  size,
                  md5Checksum: item.md5Checksum,
                  modifiedTime: item.modifiedTime || new Date().toISOString(),
                };

                batchDocs.push(docItem);
                discoveredDocIds.add(item.id);
                totalDocsCount++;
              }
            }

            // Progressive insertion into Dexie and in-memory search index
            if (batchDocs.length > 0) {
              await putDocs(batchDocs);
              searchIndex.upsertDocs(batchDocs);
            }

            this.progress.foldersDiscovered = totalFoldersCount;
            this.progress.docsDiscovered = totalDocsCount;
            this.notify();
          } while (pageToken);
        })
      );
    }

    // Save all folders to Dexie folders table
    await db.folders.clear();
    await db.folders.bulkPut(Array.from(folderMap.values()));

    // Purge any local documents that no longer exist in Drive
    const existingLocalDocs = await db.docs.toArray();
    const staleDocIds: string[] = [];
    for (const localDoc of existingLocalDocs) {
      if (!discoveredDocIds.has(localDoc.id)) {
        staleDocIds.push(localDoc.id);
      }
    }
    if (staleDocIds.length > 0) {
      await deleteDocs(staleDocIds);
      searchIndex.removeDocs(staleDocIds);
    }

    // Acquire and store changes startPageToken for future incremental syncs
    try {
      const tokenRes = await driveFetch(
        'https://www.googleapis.com/drive/v3/changes/startPageToken'
      );
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.startPageToken) {
          await setSetting(SETTING_CHANGES_TOKEN, tokenData.startPageToken);
        }
      }
    } catch (err) {
      console.warn('Failed to obtain startPageToken:', err);
    }
  }

  /**
   * Incremental sync using Google Drive Changes API.
   * Returns true on success, false if token is expired/invalid.
   */
  public async performIncrementalSync(
    rootFolderId: string,
    startPageToken: string
  ): Promise<boolean> {
    this.progress = {
      status: 'syncing',
      foldersDiscovered: (await db.folders.count()) || 1,
      docsDiscovered: searchIndex.getCount(),
      currentFolder: 'Checking for changes...',
      lastSyncTime: this.progress.lastSyncTime,
    };
    this.notify();

    let pageToken: string | undefined = startPageToken;
    let newStartToken: string | undefined = undefined;

    // Load known folders and category rules
    const knownFolders = await db.folders.toArray();
    const folderMap = new Map<string, FolderRecord>();
    knownFolders.forEach((f) => folderMap.set(f.id, f));

    const categoryOverrides = await getAllCategoryOverrides();
    const categoryRules = await getSetting<Record<DocCategory, string[]>>(
      SETTING_CATEGORY_RULES,
      DEFAULT_CATEGORY_RULES
    );

    const changedDocsToUpsert: DocItem[] = [];
    const docIdsToDelete: string[] = [];

    while (pageToken) {
      const fields = encodeURIComponent(
        'nextPageToken, newStartPageToken, changes(fileId, removed, file(id, name, mimeType, size, md5Checksum, modifiedTime, parents, trashed))'
      );
      const url = `https://www.googleapis.com/drive/v3/changes?pageToken=${pageToken}&fields=${fields}`;

      const res = await driveFetch(url);

      if (res.status === 400 || res.status === 410) {
        // Token invalid or expired - trigger full resync
        console.warn('Changes token invalid or expired (HTTP ' + res.status + ').');
        return false;
      }

      if (!res.ok) {
        console.warn(`Changes API error: HTTP ${res.status}`);
        return false;
      }

      const data = await res.json();
      const changes: any[] = data.changes || [];
      pageToken = data.nextPageToken;
      if (data.newStartPageToken) {
        newStartToken = data.newStartPageToken;
      }

      for (const change of changes) {
        const fileId = change.fileId;
        const isRemoved = change.removed || (change.file && change.file.trashed);

        if (isRemoved) {
          // If deleted/trashed, check if it was in our local docs
          if (searchIndex.getDoc(fileId)) {
            docIdsToDelete.push(fileId);
          }
          if (folderMap.has(fileId)) {
            folderMap.delete(fileId);
            await db.folders.delete(fileId);
          }
          continue;
        }

        const file = change.file;
        if (!file) continue;

        // Check if file belongs to any folder in our tree
        const parents: string[] = file.parents || [];
        const matchedParentId = parents.find((p) => folderMap.has(p));

        if (!matchedParentId && file.id !== rootFolderId) {
          // File is not in our monitored folder tree; check if it previously was
          if (searchIndex.getDoc(fileId)) {
            docIdsToDelete.push(fileId);
          }
          continue;
        }

        // If it's a folder, update our folder structure
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          const parentFolder = matchedParentId ? folderMap.get(matchedParentId) : undefined;
          const folderPath = parentFolder
            ? `${parentFolder.path} / ${file.name}`
            : file.name;
          const folderRecord: FolderRecord = {
            id: file.id,
            name: file.name,
            parentId: matchedParentId,
            path: folderPath,
          };
          folderMap.set(file.id, folderRecord);
          await db.folders.put(folderRecord);
          continue;
        }

        // If it's a supported document, update it
        if (isSupportedDocType(file.mimeType, file.name)) {
          const parentFolder = matchedParentId ? folderMap.get(matchedParentId) : undefined;
          const folderPath = parentFolder ? parentFolder.path : 'Root';
          const cleanTitle = deriveCleanTitle(file.name);
          const manualOverride = categoryOverrides.get(file.id);
          const category = determineCategory({
            name: file.name,
            cleanTitle,
            folderPath,
            manualOverride,
            rules: categoryRules,
          });

          const size = typeof file.size === 'string' ? parseInt(file.size, 10) || 0 : Number(file.size) || 0;

          const docItem: DocItem = {
            id: file.id,
            name: file.name,
            cleanTitle,
            folderPath,
            parentId: matchedParentId || rootFolderId,
            category,
            mimeType: file.mimeType,
            size,
            md5Checksum: file.md5Checksum,
            modifiedTime: file.modifiedTime || new Date().toISOString(),
          };

          changedDocsToUpsert.push(docItem);
        }
      }
    }

    // Apply deletions
    if (docIdsToDelete.length > 0) {
      await deleteDocs(docIdsToDelete);
      searchIndex.removeDocs(docIdsToDelete);
    }

    // Apply updates/additions
    if (changedDocsToUpsert.length > 0) {
      await putDocs(changedDocsToUpsert);
      searchIndex.upsertDocs(changedDocsToUpsert);
    }

    if (newStartToken) {
      await setSetting(SETTING_CHANGES_TOKEN, newStartToken);
    }

    this.progress.docsDiscovered = searchIndex.getCount();
    this.progress.foldersDiscovered = folderMap.size;
    this.notify();

    return true;
  }
}

export const driveSync = new DriveSyncService();
