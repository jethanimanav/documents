import Dexie, { type EntityTable } from 'dexie';
import type { DocItem, CategoryOverride, DocCategory } from '../types';

export interface SettingRecord {
  key: string;
  value: any;
}

export interface PreparedRecord {
  id: string;
  originalId: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: number;
}

export interface FolderRecord {
  id: string;
  name: string;
  parentId?: string;
  path: string;
}

export class AppDatabase extends Dexie {
  docs!: EntityTable<DocItem, 'id'>;
  categoryOverrides!: EntityTable<CategoryOverride, 'fileId'>;
  folders!: EntityTable<FolderRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  preparedFiles!: EntityTable<PreparedRecord, 'id'>;

  constructor() {
    super('PersonalDocsDB');
    this.version(2).stores({
      docs: 'id, cleanTitle, name, folderPath, category, mimeType, size, modifiedTime',
      categoryOverrides: 'fileId, category',
      folders: 'id, parentId, name, path',
      settings: 'key',
      preparedFiles: 'id, originalId, createdAt',
    });
  }
}

export const db = new AppDatabase();

// Settings helpers
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const record = await db.settings.get(key);
    return record !== undefined ? (record.value as T) : defaultValue;
  } catch (err) {
    console.error(`Error reading setting ${key}:`, err);
    return defaultValue;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch (err) {
    console.error(`Error saving setting ${key}:`, err);
  }
}

// Category override helpers
export async function setCategoryOverride(fileId: string, category: DocCategory): Promise<void> {
  await db.categoryOverrides.put({ fileId, category });
  const doc = await db.docs.get(fileId);
  if (doc) {
    await db.docs.update(fileId, { category });
  }
}

export async function getAllCategoryOverrides(): Promise<Map<string, DocCategory>> {
  const overrides = await db.categoryOverrides.toArray();
  const map = new Map<string, DocCategory>();
  overrides.forEach((o) => map.set(o.fileId, o.category));
  return map;
}

// Progressive docs insertion/update
export async function putDocs(docs: DocItem[]): Promise<void> {
  if (docs.length === 0) return;
  await db.docs.bulkPut(docs);
}

export async function deleteDocs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db.docs.bulkDelete(ids);
}

export async function wipeAllLocalData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.docs, db.categoryOverrides, db.folders, db.settings, db.preparedFiles],
    async () => {
      await db.docs.clear();
      await db.categoryOverrides.clear();
      await db.folders.clear();
      await db.settings.clear();
      await db.preparedFiles.clear();
    }
  );
}
