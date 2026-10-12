import type { DocItem } from '../types';

export interface DriveFetchStrategy {
  url: string;
  isExport: boolean;
  exportMimeType?: string;
  previewType: 'pdf' | 'image' | 'unsupported';
  isSupported: boolean;
  unsupportedReason?: string;
}

export const GOOGLE_APPS_EXPORT_MAPPING: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.drawing': 'application/pdf',
};

/**
 * Determines the appropriate Google Drive API URL and preview strategy for a document.
 * - Binary files (PDF, images) use the '?alt=media' download endpoint.
 * - Google-native files (Docs, Sheets, Slides) use the '/export?mimeType=application/pdf' endpoint.
 * - Non-previewable types are flagged with descriptive user-facing explanations.
 */
export function getDriveFetchStrategy(doc: Pick<DocItem, 'id' | 'name' | 'mimeType'>): DriveFetchStrategy {
  const mime = (doc.mimeType || '').toLowerCase();
  const name = (doc.name || '').toLowerCase();

  // 1. Google-native Docs, Sheets, Slides, Drawings -> Export as PDF
  if (GOOGLE_APPS_EXPORT_MAPPING[mime]) {
    const exportMime = GOOGLE_APPS_EXPORT_MAPPING[mime];
    return {
      url: `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=${encodeURIComponent(exportMime)}`,
      isExport: true,
      exportMimeType: exportMime,
      previewType: 'pdf',
      isSupported: true,
    };
  }

  // 2. Google-native non-exportable types
  if (mime === 'application/vnd.google-apps.form') {
    return {
      url: '',
      isExport: false,
      previewType: 'unsupported',
      isSupported: false,
      unsupportedReason: 'Google Forms cannot be exported as a PDF or image preview.',
    };
  }
  if (mime === 'application/vnd.google-apps.folder') {
    return {
      url: '',
      isExport: false,
      previewType: 'unsupported',
      isSupported: false,
      unsupportedReason: 'Folders cannot be previewed as documents.',
    };
  }

  // 3. Binary PDF
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    return {
      url: `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
      isExport: false,
      previewType: 'pdf',
      isSupported: true,
    };
  }

  // 4. Binary Images: JPEG, PNG, WebP
  if (
    mime === 'image/jpeg' ||
    mime === 'image/jpg' ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    mime === 'image/png' ||
    name.endsWith('.png') ||
    mime === 'image/webp' ||
    name.endsWith('.webp')
  ) {
    return {
      url: `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
      isExport: false,
      previewType: 'image',
      isSupported: true,
    };
  }

  // 5. Binary Unsupported Formats (can still be downloaded, but not previewed in-app)
  return {
    url: `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`,
    isExport: false,
    previewType: 'unsupported',
    isSupported: false,
    unsupportedReason: `In-app preview is not supported for "${doc.mimeType || 'unknown format'}". Only PDF, JPEG, PNG, WebP, and Google Docs/Sheets/Slides can be previewed.`,
  };
}
