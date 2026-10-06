import { describe, it, expect } from 'vitest';
import {
  extractFolderId,
  deriveCleanTitle,
  formatFileSize,
  getFileExtension,
  isSupportedDocType,
} from '../folder';
import { determineCategory, DEFAULT_CATEGORY_RULES } from '../category';

describe('Folder and File Utilities', () => {
  describe('extractFolderId', () => {
    it('extracts folder ID from standard Google Drive URL', () => {
      const url = 'https://drive.google.com/drive/folders/1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC';
      expect(extractFolderId(url)).toBe('1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC');
    });

    it('extracts folder ID from URL with user index and query params', () => {
      const url =
        'https://drive.google.com/drive/u/0/folders/1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC?usp=sharing';
      expect(extractFolderId(url)).toBe('1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC');
    });

    it('extracts folder ID from open?id= format', () => {
      const url = 'https://drive.google.com/open?id=1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC';
      expect(extractFolderId(url)).toBe('1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC');
    });

    it('returns raw ID directly if provided as plain string', () => {
      expect(extractFolderId('1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC')).toBe(
        '1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC'
      );
    });

    it('handles whitespace gracefully', () => {
      expect(extractFolderId('  1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC \n')).toBe(
        '1EvJdxKvd7YzX1kb-4tlX-z1baFmoV3SC'
      );
    });

    it('returns empty string for empty input', () => {
      expect(extractFolderId('')).toBe('');
    });
  });

  describe('deriveCleanTitle', () => {
    it('removes extension and replaces underscores with spaces', () => {
      expect(deriveCleanTitle('10th_Marksheet.pdf')).toBe('10th Marksheet');
      expect(deriveCleanTitle('Test_Aadhar.pdf')).toBe('Test Aadhar');
    });

    it('replaces hyphens and collapses multiple spaces', () => {
      expect(deriveCleanTitle('PAN-Card--Final_Copy.jpg')).toBe('PAN Card Final Copy');
    });

    it('handles files with no extension', () => {
      expect(deriveCleanTitle('Passport_Copy')).toBe('Passport Copy');
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes, KB, MB correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(200 * 1024)).toBe('200.0 KB');
      expect(formatFileSize(3.5 * 1024 * 1024)).toBe('3.5 MB');
    });

    it('handles 0 or negative values', () => {
      expect(formatFileSize(0)).toBe('0 B');
      expect(formatFileSize(-10)).toBe('0 B');
    });
  });

  describe('getFileExtension and isSupportedDocType', () => {
    it('identifies extension correctly', () => {
      expect(getFileExtension('doc.pdf')).toBe('PDF');
      expect(getFileExtension('photo.JPEG')).toBe('JPEG');
      expect(getFileExtension('image.png')).toBe('PNG');
    });

    it('accepts supported document formats (PDF, JPEG, PNG, WebP, HEIC)', () => {
      expect(isSupportedDocType('application/pdf', 'doc.pdf')).toBe(true);
      expect(isSupportedDocType('image/jpeg', 'photo.jpg')).toBe(true);
      expect(isSupportedDocType('image/png', 'scan.png')).toBe(true);
      expect(isSupportedDocType('image/webp', 'file.webp')).toBe(true);
      expect(isSupportedDocType('image/heic', 'img.heic')).toBe(true);
    });

    it('rejects Google-native files (Docs, Sheets, Slides)', () => {
      expect(isSupportedDocType('application/vnd.google-apps.document', 'Notes')).toBe(false);
      expect(
        isSupportedDocType('application/vnd.google-apps.spreadsheet', 'Budget')
      ).toBe(false);
      expect(
        isSupportedDocType('application/vnd.google-apps.presentation', 'Slides')
      ).toBe(false);
    });
  });
});

describe('Category Assignment Rules', () => {
  it('prioritizes manual override over all folder and keyword rules', () => {
    const category = determineCategory({
      name: '10th_Marksheet.pdf', // normally Education
      cleanTitle: '10th Marksheet',
      folderPath: 'Education / School',
      manualOverride: 'Identity', // user explicitly picked Identity
    });
    expect(category).toBe('Identity');
  });

  it('matches top-level folder name if no manual override', () => {
    const category = determineCategory({
      name: 'Scan_001.pdf', // generic filename
      cleanTitle: 'Scan 001',
      folderPath: 'Personal Documents Test / Financial / Tax',
    });
    expect(category).toBe('Financial');
  });

  it('falls back to keyword rules if folder name does not match any category', () => {
    const category = determineCategory({
      name: 'Aadhar_Card_Front.pdf',
      cleanTitle: 'Aadhar Card Front',
      folderPath: 'Personal Documents Test / Miscellaneous',
      rules: DEFAULT_CATEGORY_RULES,
    });
    expect(category).toBe('Identity');
  });

  it('correctly matches education keywords', () => {
    const category = determineCategory({
      name: '12th_Passing_Certificate.pdf',
      folderPath: 'Unsorted',
    });
    expect(category).toBe('Education');
  });

  it('correctly matches financial keywords', () => {
    const category = determineCategory({
      name: 'Salary_Slip_March.pdf',
      folderPath: 'Unsorted',
    });
    expect(category).toBe('Financial');
  });

  it('falls back to Other if no rules or folder match', () => {
    const category = determineCategory({
      name: 'Random_Notes_XYZ.pdf',
      cleanTitle: 'Random Notes XYZ',
      folderPath: 'Unsorted / Misc',
    });
    expect(category).toBe('Other');
  });
});
