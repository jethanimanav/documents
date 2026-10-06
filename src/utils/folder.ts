/**
 * Utilities for Google Drive folder ID extraction, filename cleaning,
 * and file size formatting.
 */

/**
 * Extracts a Google Drive folder ID from a full URL or raw ID string.
 * Supports:
 * - https://drive.google.com/drive/folders/1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC
 * - https://drive.google.com/drive/u/0/folders/1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC?usp=sharing
 * - https://drive.google.com/drive/folders/1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC/view
 * - https://drive.google.com/open?id=1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC
 * - Raw ID string: 1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC
 */
export function extractFolderId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();

  // Pattern: /folders/<id>
  const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch && foldersMatch[1]) {
    return foldersMatch[1];
  }

  // Pattern: ?id=<id> or &id=<id>
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (queryMatch && queryMatch[1]) {
    return queryMatch[1];
  }

  // Raw folder ID check (typically 15-44 chars alphanumeric, dashes, underscores)
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Derives a human-friendly clean title from a filename.
 * E.g., "10th_Marksheet.pdf" -> "10th Marksheet"
 * "Test_Aadhar_Card-2024.pdf" -> "Test Aadhar Card 2024"
 */
export function deriveCleanTitle(filename: string): string {
  if (!filename) return '';

  // Remove extension
  const withoutExt = filename.replace(/\.[a-zA-Z0-9]+$/, '');

  // Replace underscores and hyphens with spaces
  const withSpaces = withoutExt.replace(/[_-]+/g, ' ');

  // Collapse multiple whitespace characters and trim
  return withSpaces.replace(/\s+/g, ' ').trim() || filename;
}

/**
 * Formats byte size into human-readable string (KB, MB, GB).
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${i === 0 ? val : val.toFixed(1)} ${units[i]}`;
}

/**
 * Extracts file extension (e.g. "PDF", "JPG", "PNG").
 */
export function getFileExtension(filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toUpperCase() : 'FILE';
}

/**
 * Checks whether a file is an accepted document type.
 * Supported: PDF, JPEG, PNG, WebP, HEIC.
 * Skips Google-native formats (Docs, Sheets, Slides, Drawings).
 */
export function isSupportedDocType(mimeType: string, filename: string = ''): boolean {
  if (!mimeType) return false;

  // Explicitly skip Google-native files
  if (
    mimeType.startsWith('application/vnd.google-apps.') &&
    mimeType !== 'application/vnd.google-apps.folder'
  ) {
    return false;
  }

  const normalizedMime = mimeType.toLowerCase();
  const ext = getFileExtension(filename).toLowerCase();

  const supportedMimes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ];

  if (supportedMimes.includes(normalizedMime)) {
    return true;
  }

  const supportedExts = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
  return supportedExts.includes(ext);
}
