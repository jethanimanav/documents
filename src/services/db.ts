import Dexie, { type EntityTable } from 'dexie';
import type { DocItem, CategoryOverride } from '../types';

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

export class AppDatabase extends Dexie {
  docs!: EntityTable<DocItem, 'id'>;
  categoryOverrides!: EntityTable<CategoryOverride, 'fileId'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  preparedFiles!: EntityTable<PreparedRecord, 'id'>;

  constructor() {
    super('PersonalDocsDB');
    this.version(1).stores({
      docs: 'id, cleanTitle, name, folderPath, category, mimeType, size, modifiedTime',
      categoryOverrides: 'fileId, category',
      settings: 'key',
      preparedFiles: 'id, originalId, createdAt',
    });
  }
}

export const db = new AppDatabase();

// Helpers for settings retrieval and persistence
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

export async function wipeAllLocalData(): Promise<void> {
  await db.transaction('rw', [db.docs, db.categoryOverrides, db.settings, db.preparedFiles], async () => {
    await db.docs.clear();
    await db.categoryOverrides.clear();
    await db.settings.clear();
    await db.preparedFiles.clear();
  });
}
