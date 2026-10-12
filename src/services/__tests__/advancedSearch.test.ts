import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  searchIndex,
  matchesFileType,
  matchesSizeRange,
  matchesDateRange,
  sortDocs,
  getRecentSearchHistory,
  addRecentSearchQuery,
  clearRecentSearchHistory,
} from '../searchIndex';
import { db, setCategoryOverride } from '../db';
import type { DocItem } from '../../types';

describe('Milestone 1 — Advanced Document Search', () => {
  const sampleDocs: DocItem[] = [
    {
      id: 'doc-1',
      name: 'Passport_Scan.pdf',
      cleanTitle: 'Passport Scan',
      folderPath: 'Personal/Identity',
      parentId: 'folder-identity',
      category: 'Identity',
      mimeType: 'application/pdf',
      size: 450 * 1024, // 450 KB
      modifiedTime: '2026-03-15T10:00:00.000Z',
    },
    {
      id: 'doc-2',
      name: 'Degree_Certificate.png',
      cleanTitle: 'Degree Certificate',
      folderPath: 'Personal/Education',
      parentId: 'folder-edu',
      category: 'Education',
      mimeType: 'image/png',
      size: 1.5 * 1024 * 1024, // 1.5 MB
      modifiedTime: '2026-02-10T14:30:00.000Z',
    },
    {
      id: 'doc-3',
      name: 'Tax_Return_2025.pdf',
      cleanTitle: 'Tax Return 2025',
      folderPath: 'Finances/Taxes',
      parentId: 'folder-fin',
      category: 'Financial',
      mimeType: 'application/pdf',
      size: 3 * 1024 * 1024, // 3 MB
      modifiedTime: '2026-03-28T09:15:00.000Z',
    },
    {
      id: 'doc-4',
      name: 'Expense_Ledger.xlsx',
      cleanTitle: 'Expense Ledger',
      folderPath: 'Finances/Spreadsheets',
      parentId: 'folder-fin',
      category: 'Financial',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 120 * 1024, // 120 KB
      modifiedTime: '2025-12-01T16:00:00.000Z',
    },
    {
      id: 'doc-5',
      name: 'Medical_Prescription.jpg',
      cleanTitle: 'Medical Prescription',
      folderPath: 'Health/Records',
      parentId: 'folder-health',
      category: 'Medical',
      mimeType: 'image/jpeg',
      size: 850 * 1024, // 850 KB
      modifiedTime: '2026-01-20T08:00:00.000Z',
    },
    {
      id: 'doc-6',
      name: 'House_Insurance_Policy.pdf',
      cleanTitle: 'House Insurance Policy',
      folderPath: 'Policies/Insurance',
      parentId: 'folder-ins',
      category: 'Insurance',
      mimeType: 'application/pdf',
      size: 12 * 1024 * 1024, // 12 MB
      modifiedTime: '2026-03-30T11:00:00.000Z',
    },
    {
      id: 'doc-7',
      name: 'Notes_Without_Size.txt',
      cleanTitle: 'Notes Without Size',
      folderPath: 'Notes',
      parentId: 'folder-notes',
      category: 'Other',
      mimeType: 'text/plain',
      size: NaN, // corrupted / missing size
      modifiedTime: '', // missing date
    },
  ];

  beforeEach(async () => {
    await db.docs.clear();
    await db.categoryOverrides.clear();
    await db.settings.clear();
    searchIndex.initialize(sampleDocs);
  });

  describe('Multi-field Search', () => {
    it('searches by clean title', () => {
      const results = searchIndex.search('Passport');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-1');
    });

    it('searches by raw file name', () => {
      const results = searchIndex.search('Expense_Ledger');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-4');
    });

    it('searches by folder path', () => {
      const results = searchIndex.search('Finances');
      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain('doc-3');
      expect(ids).toContain('doc-4');
    });

    it('searches by category string', () => {
      const results = searchIndex.search('Insurance');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].id).toBe('doc-6');
    });
  });

  describe('File Type Filtering', () => {
    it('filters PDF files correctly', () => {
      const results = searchIndex.searchAdvanced({ fileType: 'pdf' });
      expect(results).toHaveLength(3);
      results.forEach((doc) => {
        expect(matchesFileType(doc, 'pdf')).toBe(true);
      });
    });

    it('filters Image files correctly', () => {
      const results = searchIndex.searchAdvanced({ fileType: 'image' });
      expect(results).toHaveLength(2);
      const ids = results.map((d) => d.id);
      expect(ids).toContain('doc-2');
      expect(ids).toContain('doc-5');
    });

    it('filters Spreadsheet files correctly', () => {
      const results = searchIndex.searchAdvanced({ fileType: 'spreadsheet' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-4');
    });

    it('filters Document files correctly', () => {
      const results = searchIndex.searchAdvanced({ fileType: 'document' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-7');
    });
  });

  describe('Size Range Filtering', () => {
    it('filters files under 500 KB', () => {
      const results = searchIndex.searchAdvanced({
        sizeRange: { maxBytes: 500 * 1024 },
      });
      // doc-1 (450KB), doc-4 (120KB), and doc-7 (NaN treated as 0)
      const ids = results.map((d) => d.id);
      expect(ids).toContain('doc-1');
      expect(ids).toContain('doc-4');
      expect(ids).not.toContain('doc-2');
      expect(ids).not.toContain('doc-3');
    });

    it('filters files between 500 KB and 2 MB', () => {
      const results = searchIndex.searchAdvanced({
        sizeRange: { minBytes: 500 * 1024, maxBytes: 2 * 1024 * 1024 },
      });
      const ids = results.map((d) => d.id);
      expect(ids).toContain('doc-2'); // 1.5MB
      expect(ids).toContain('doc-5'); // 850KB
      expect(ids).not.toContain('doc-1');
      expect(ids).not.toContain('doc-6');
    });

    it('filters files over 10 MB', () => {
      const results = searchIndex.searchAdvanced({
        sizeRange: { minBytes: 10 * 1024 * 1024 },
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-6'); // 12MB
    });

    it('safely handles missing or NaN sizes', () => {
      const doc = sampleDocs.find((d) => d.id === 'doc-7')!;
      expect(matchesSizeRange(doc, { minBytes: 1000 })).toBe(false);
      expect(matchesSizeRange(doc, { maxBytes: 1000 })).toBe(true);
    });
  });

  describe('Date Range Filtering', () => {
    it('filters files by start date', () => {
      const results = searchIndex.searchAdvanced({
        dateRange: { startDate: '2026-03-01' },
      });
      const ids = results.map((d) => d.id);
      expect(ids).toContain('doc-1'); // 2026-03-15
      expect(ids).toContain('doc-3'); // 2026-03-28
      expect(ids).toContain('doc-6'); // 2026-03-30
      expect(ids).not.toContain('doc-2'); // 2026-02-10
    });

    it('filters files by end date', () => {
      const results = searchIndex.searchAdvanced({
        dateRange: { endDate: '2025-12-31' },
      });
      const ids = results.map((d) => d.id);
      expect(ids).toContain('doc-4'); // 2025-12-01
      expect(ids).not.toContain('doc-1');
    });

    it('safely handles missing or invalid dates without throwing', () => {
      const doc = sampleDocs.find((d) => d.id === 'doc-7')!;
      expect(matchesDateRange(doc, { startDate: '2026-01-01' })).toBe(false);
    });
  });

  describe('Sorting', () => {
    it('directly sorts docs array with sortDocs helper', () => {
      const sorted = sortDocs(sampleDocs, 'name_asc');
      expect(sorted[0].cleanTitle).toBe('Degree Certificate');
      expect(sortDocs(sampleDocs, 'default')).toEqual(sampleDocs);
    });

    it('sorts by name ascending', () => {
      const results = searchIndex.searchAdvanced({ sortBy: 'name_asc' });
      expect(results[0].cleanTitle).toBe('Degree Certificate');
      expect(results[1].cleanTitle).toBe('Expense Ledger');
    });

    it('sorts by name descending', () => {
      const results = searchIndex.searchAdvanced({ sortBy: 'name_desc' });
      expect(results[0].cleanTitle).toBe('Tax Return 2025');
    });

    it('sorts by newest first', () => {
      const results = searchIndex.searchAdvanced({ sortBy: 'newest' });
      expect(results[0].id).toBe('doc-6'); // 2026-03-30
      expect(results[1].id).toBe('doc-3'); // 2026-03-28
    });

    it('sorts by oldest first', () => {
      const results = searchIndex.searchAdvanced({ sortBy: 'oldest' });
      expect(results[0].id).toBe('doc-7'); // empty/0 date
      expect(results[1].id).toBe('doc-4'); // 2025-12-01
    });

    it('sorts by smallest first', () => {
      const results = searchIndex.searchAdvanced({ sortBy: 'smallest' });
      expect(results[0].id).toBe('doc-7'); // NaN/0
      expect(results[1].id).toBe('doc-4'); // 120 KB
    });

    it('sorts by largest first', () => {
      const results = searchIndex.searchAdvanced({ sortBy: 'largest' });
      expect(results[0].id).toBe('doc-6'); // 12 MB
      expect(results[1].id).toBe('doc-3'); // 3 MB
    });
  });

  describe('Combined Filters', () => {
    it('combines query, category, fileType, size and sorting', () => {
      const results = searchIndex.searchAdvanced({
        query: 'Tax',
        category: 'Financial',
        fileType: 'pdf',
        sizeRange: { minBytes: 1 * 1024 * 1024 },
        sortBy: 'newest',
      });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('doc-3');
    });
  });

  describe('Category Updates Immediate Reflection', () => {
    it('immediately reflects category update without Drive refetching', async () => {
      // Move doc-2 (Degree Certificate) from Education to Identity
      await setCategoryOverride('doc-2', 'Identity');
      const updatedDoc = { ...sampleDocs[1], category: 'Identity' as const };
      searchIndex.upsertDocs([updatedDoc]);

      const identityResults = searchIndex.searchAdvanced({ category: 'Identity' });
      expect(identityResults.map((d) => d.id)).toContain('doc-2');

      const eduResults = searchIndex.searchAdvanced({ category: 'Education' });
      expect(eduResults.map((d) => d.id)).not.toContain('doc-2');
    });
  });

  describe('Recent Search History', () => {
    it('stores, deduplicates, and limits recent searches', async () => {
      await clearRecentSearchHistory();
      let history = await getRecentSearchHistory();
      expect(history).toEqual([]);

      await addRecentSearchQuery('Passport');
      await addRecentSearchQuery('Tax Return');
      await addRecentSearchQuery('passport'); // case-insensitive deduplication

      history = await getRecentSearchHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toBe('passport');
      expect(history[1]).toBe('Tax Return');

      await clearRecentSearchHistory();
      expect(await getRecentSearchHistory()).toEqual([]);
    });
  });
});
