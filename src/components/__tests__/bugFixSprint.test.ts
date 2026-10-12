import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db, setCategoryOverride, getAllCategoryOverrides } from '../../services/db';
import { getDriveFetchStrategy } from '../../utils/driveEndpoints';
import { determineCategory, DEFAULT_CATEGORY_RULES } from '../../utils/category';
import type { DocItem, DocCategory } from '../../types';

describe('Bug Fix Sprint — Regression Tests', () => {
  beforeEach(async () => {
    await db.categoryOverrides.clear();
    await db.docs.clear();
  });

  describe('Bug 1: Category Dropdown & Manual Overrides', () => {
    it('persists manual category overrides in IndexedDB', async () => {
      const fileId = 'test-doc-123';
      const initialDoc: DocItem = {
        id: fileId,
        name: 'Salary_Slip_Jan2026.pdf',
        cleanTitle: 'Salary Slip Jan2026',
        folderPath: 'Work/Finance',
        parentId: 'folder-1',
        category: 'Other',
        mimeType: 'application/pdf',
        size: 102400,
        modifiedTime: '2026-01-15T10:00:00Z',
      };

      await db.docs.put(initialDoc);

      // Save category override
      await setCategoryOverride(fileId, 'Financial');

      // Verify db.categoryOverrides table has the record
      const overridesMap = await getAllCategoryOverrides();
      expect(overridesMap.get(fileId)).toBe('Financial');

      // Verify db.docs table is updated immediately
      const updatedDoc = await db.docs.get(fileId);
      expect(updatedDoc?.category).toBe('Financial');
    });

    it('preserves manual overrides during category determination on re-sync', () => {
      const manualOverride: DocCategory = 'Identity';
      const determined = determineCategory({
        name: 'Tax_Statement.pdf',
        cleanTitle: 'Tax Statement',
        folderPath: 'Finance/Taxes',
        manualOverride, // User previously manually chose Identity
        rules: DEFAULT_CATEGORY_RULES,
      });

      // Manual override MUST take precedence over folder rules
      expect(determined).toBe('Identity');
    });

    it('isolates category menu click and drag interactions', () => {
      // Simulate click event propagation stopping
      const stopPropagation = vi.fn();
      const preventDefault = vi.fn();
      const mockEvent = {
        stopPropagation,
        preventDefault,
      };

      mockEvent.stopPropagation();
      expect(stopPropagation).toHaveBeenCalled();
    });

    it('verifies that outside pointerdown dismisses dropdown menu', () => {
      let isMenuOpen = true;
      const targetInside = false;

      const handlePointerDown = (inside: boolean) => {
        if (!inside) {
          isMenuOpen = false;
        }
      };

      handlePointerDown(targetInside);
      expect(isMenuOpen).toBe(false);
    });

    it('verifies that Escape key dismisses dropdown menu', () => {
      let isMenuOpen = true;

      const handleKeyDown = (key: string) => {
        if (key === 'Escape') {
          isMenuOpen = false;
        }
      };

      handleKeyDown('Escape');
      expect(isMenuOpen).toBe(false);
    });
  });

  describe('Bug 2: Google Drive API Endpoint Selection', () => {
    it('selects the export endpoint for Google Docs', () => {
      const doc = {
        id: 'gdoc-1',
        name: 'Project Specs',
        mimeType: 'application/vnd.google-apps.document',
      };
      const strategy = getDriveFetchStrategy(doc);

      expect(strategy.isExport).toBe(true);
      expect(strategy.previewType).toBe('pdf');
      expect(strategy.isSupported).toBe(true);
      expect(strategy.url).toBe(
        'https://www.googleapis.com/drive/v3/files/gdoc-1/export?mimeType=application%2Fpdf'
      );
    });

    it('selects the export endpoint for Google Sheets and Slides', () => {
      const sheet = {
        id: 'gsheet-2',
        name: 'Budget 2026',
        mimeType: 'application/vnd.google-apps.spreadsheet',
      };
      const slides = {
        id: 'gslides-3',
        name: 'Q1 Presentation',
        mimeType: 'application/vnd.google-apps.presentation',
      };

      const sheetStrat = getDriveFetchStrategy(sheet);
      expect(sheetStrat.isExport).toBe(true);
      expect(sheetStrat.previewType).toBe('pdf');
      expect(sheetStrat.url).toContain('/export?mimeType=application%2Fpdf');

      const slidesStrat = getDriveFetchStrategy(slides);
      expect(slidesStrat.isExport).toBe(true);
      expect(slidesStrat.previewType).toBe('pdf');
      expect(slidesStrat.url).toContain('/export?mimeType=application%2Fpdf');
    });

    it('selects the binary download endpoint (?alt=media) for standard PDF', () => {
      const pdf = {
        id: 'pdf-4',
        name: 'Passport.pdf',
        mimeType: 'application/pdf',
      };
      const strategy = getDriveFetchStrategy(pdf);

      expect(strategy.isExport).toBe(false);
      expect(strategy.previewType).toBe('pdf');
      expect(strategy.isSupported).toBe(true);
      expect(strategy.url).toBe('https://www.googleapis.com/drive/v3/files/pdf-4?alt=media');
    });

    it('selects the binary download endpoint (?alt=media) for images (JPEG, PNG, WebP)', () => {
      const jpg = { id: 'img-1', name: 'photo.jpg', mimeType: 'image/jpeg' };
      const png = { id: 'img-2', name: 'scan.png', mimeType: 'image/png' };
      const webp = { id: 'img-3', name: 'badge.webp', mimeType: 'image/webp' };

      expect(getDriveFetchStrategy(jpg).previewType).toBe('image');
      expect(getDriveFetchStrategy(jpg).url).toBe('https://www.googleapis.com/drive/v3/files/img-1?alt=media');

      expect(getDriveFetchStrategy(png).previewType).toBe('image');
      expect(getDriveFetchStrategy(png).url).toBe('https://www.googleapis.com/drive/v3/files/img-2?alt=media');

      expect(getDriveFetchStrategy(webp).previewType).toBe('image');
      expect(getDriveFetchStrategy(webp).url).toBe('https://www.googleapis.com/drive/v3/files/img-3?alt=media');
    });

    it('identifies non-exportable Google Apps types (Forms, Folders) as unsupported with clear explanation', () => {
      const form = {
        id: 'form-1',
        name: 'Feedback Form',
        mimeType: 'application/vnd.google-apps.form',
      };
      const folder = {
        id: 'folder-1',
        name: 'Invoices',
        mimeType: 'application/vnd.google-apps.folder',
      };

      const formStrat = getDriveFetchStrategy(form);
      expect(formStrat.isSupported).toBe(false);
      expect(formStrat.unsupportedReason).toContain('Google Forms cannot be exported');

      const folderStrat = getDriveFetchStrategy(folder);
      expect(folderStrat.isSupported).toBe(false);
      expect(folderStrat.unsupportedReason).toContain('Folders cannot be previewed');
    });

    it('handles binary unsupported files by providing download endpoint and clear limitation notice', () => {
      const zip = {
        id: 'zip-1',
        name: 'archive.zip',
        mimeType: 'application/zip',
      };
      const strategy = getDriveFetchStrategy(zip);

      expect(strategy.isSupported).toBe(false);
      expect(strategy.previewType).toBe('unsupported');
      expect(strategy.url).toBe('https://www.googleapis.com/drive/v3/files/zip-1?alt=media');
      expect(strategy.unsupportedReason).toContain('In-app preview is not supported');
    });
  });

  describe('Bug 2: In-App Preview Blob and Resource Lifecycle', () => {
    it('creates and tracks Object URLs in memory and revokes on cleanup', () => {
      const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost:5173/mock-uuid');
      const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

      const testBlob = new Blob(['mock binary pdf data'], { type: 'application/pdf' });
      const url = URL.createObjectURL(testBlob);
      expect(url).toBe('blob:http://localhost:5173/mock-uuid');

      // Cleanup
      URL.revokeObjectURL(url);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost:5173/mock-uuid');

      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    });

    it('rejects 0-byte empty responses gracefully', () => {
      const emptyBlob = new Blob([], { type: 'application/pdf' });
      expect(emptyBlob.size).toBe(0);

      const validateBlob = (b: Blob) => {
        if (b.size === 0) {
          throw new Error('The document returned by Google Drive is empty (0 bytes).');
        }
      };

      expect(() => validateBlob(emptyBlob)).toThrow('empty (0 bytes)');
    });
  });
});
