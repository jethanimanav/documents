export type DocCategory =
  | 'Identity'
  | 'Education'
  | 'Financial'
  | 'Insurance'
  | 'Government'
  | 'Medical'
  | 'Other';

export interface DocItem {
  id: string;                // Drive file ID
  name: string;              // "10th_Marksheet.pdf"
  cleanTitle: string;        // "10th Marksheet" (derived)
  folderPath: string;        // "Documents/Education/School"
  parentId: string;
  category: DocCategory;     // effective category (override ?? derived)
  mimeType: string;
  size: number;              // bytes (parsed from Drive's string)
  md5Checksum?: string;      // cache invalidation
  modifiedTime: string;
}

// Stored separately so a re-sync never wipes manual choices
export interface CategoryOverride {
  fileId: string;
  category: DocCategory;
}

export interface DriveUser {
  displayName?: string;
  emailAddress?: string;
  photoLink?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  needsReconnect: boolean;
  isInitializing: boolean;
  user: DriveUser | null;
  error: string | null;
  clientId: string;
  isIOSStandalone: boolean;
}

export interface SizePreset {
  id: string;
  label: string;
  targetMaxBytes: number;
  targetMinBytes?: number;
  width?: number;
  height?: number;
  fit?: 'contain' | 'cover' | 'stretch';
  isCustom?: boolean;
}

export interface AppSettings {
  googleClientId: string;
  rootFolderId: string;
  readabilityFloorDpi: number;
  readabilityFloorQuality: number;
  categoryRules: Record<DocCategory, string[]>;
  presets: SizePreset[];
  recentFileIds: string[];
  pinnedFileIds: string[];
  driveChangesToken?: string;
  lastSyncTime?: number;
}
