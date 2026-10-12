import type { DocItem, DocCategory } from '../types';
import { deriveCleanTitle } from './folder';

export const SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.webp'] as const;
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/**
 * Checks whether a given file (or file metadata) is an accepted document type:
 * PDF, JPG/JPEG, PNG, WebP.
 */
export function isSupportedFileType(file: { name: string; type?: string }): boolean {
  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return true;
  }
  if (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg')
  ) {
    return true;
  }
  if (mime === 'image/png' || name.endsWith('.png')) {
    return true;
  }
  if (mime === 'image/webp' || name.endsWith('.webp')) {
    return true;
  }

  return false;
}

/**
 * Categorizes a file as either 'pdf', 'image', or 'unsupported'.
 */
export function getFileKind(file: { name: string; type?: string }): 'pdf' | 'image' | 'unsupported' {
  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return 'pdf';
  }
  if (
    mime.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp)$/i.test(name)
  ) {
    return 'image';
  }
  return 'unsupported';
}

/**
 * Returns a human-friendly format badge label (e.g., 'PDF', 'JPEG', 'PNG', 'WebP').
 */
export function getFileBadgeLabel(file: { name: string; type?: string }): string {
  const name = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'PDF';
  if (mime === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'JPEG';
  if (mime === 'image/png' || name.endsWith('.png')) return 'PNG';
  if (mime === 'image/webp' || name.endsWith('.webp')) return 'WebP';
  return 'FILE';
}

/**
 * Formats a byte size into an intuitive string (e.g. 2.4 MB, 450 KB).
 */
export function formatByteSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${mb.endsWith('.0') ? mb.slice(0, -2) : mb} MB`;
}

/**
 * Creates a DocItem representation for a dropped or locally picked File.
 */
export function createLocalDocItem(file: File): DocItem {
  const isPdf =
    file.type === 'application/pdf' ||
    /\.pdf$/i.test(file.name);

  const mimeType = file.type
    ? file.type
    : isPdf
    ? 'application/pdf'
    : /\.png$/i.test(file.name)
    ? 'image/png'
    : /\.webp$/i.test(file.name)
    ? 'image/webp'
    : 'image/jpeg';

  const category: DocCategory = 'Other';

  return {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    cleanTitle: deriveCleanTitle(file.name),
    folderPath: 'Local / Prepared',
    parentId: 'local',
    category,
    mimeType,
    size: file.size,
    modifiedTime: new Date(file.lastModified || Date.now()).toISOString(),
  };
}

export interface DragDropValidationResult {
  validFiles: File[];
  primaryFile: File | null;
  error: string | null;
  multipleNotice?: string | null;
}

/**
 * Validates a batch of dropped files.
 * Ensures only supported documents are passed through.
 */
export function validateDroppedFiles(files: FileList | File[]): DragDropValidationResult {
  const fileArray = Array.from(files);

  if (fileArray.length === 0) {
    return {
      validFiles: [],
      primaryFile: null,
      error: 'No files detected in drop.',
    };
  }

  const supported = fileArray.filter(isSupportedFileType);

  if (supported.length === 0) {
    return {
      validFiles: [],
      primaryFile: null,
      error: 'Unsupported file format. Please drop a PDF, JPG, PNG, or WebP document.',
    };
  }

  const multipleNotice =
    fileArray.length > 1
      ? `${supported.length} document${supported.length > 1 ? 's' : ''} detected. Prepared first: "${supported[0].name}".`
      : null;

  return {
    validFiles: supported,
    primaryFile: supported[0],
    error: null,
    multipleNotice,
  };
}
