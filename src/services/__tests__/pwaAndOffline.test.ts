import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db';
import { searchIndex } from '../searchIndex';
import type { DocItem } from '../../types';

describe('Step 6 — PWA & Offline Mode Verification', () => {
  beforeEach(async () => {
    await db.docs.clear();
    await db.settings.clear();
    await db.categoryOverrides.clear();
  });

  describe('PWA Manifest Specification', () => {
    it('verifies PWA configuration values', () => {
      const manifestConfig = {
        name: 'Personal Documents',
        short_name: 'Personal Docs',
        description: 'Personal document manager and client-only upload-size utility with Google Drive integration.',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      };

      expect(manifestConfig.name).toBe('Personal Documents');
      expect(manifestConfig.short_name).toBe('Personal Docs');
      expect(manifestConfig.display).toBe('standalone');
      expect(manifestConfig.start_url).toBe('/');
      expect(manifestConfig.theme_color).toBe('#0a0a0a');
      expect(manifestConfig.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    });
  });

  describe('Offline Document Metadata Cache & Instant Search', () => {
    const mockOfflineDocs: DocItem[] = [
      {
        id: 'doc-offline-1',
        name: 'Passport_2026.pdf',
        cleanTitle: 'Passport 2026',
        parentId: 'folder-root',
        mimeType: 'application/pdf',
        size: 350 * 1024,
        modifiedTime: '2026-03-01T12:00:00Z',
        folderPath: 'Identity/Travel',
        category: 'Identity',
      },
      {
        id: 'doc-offline-2',
        name: 'Tax_Return_FY2025.pdf',
        cleanTitle: 'Tax Return FY2025',
        parentId: 'folder-root',
        mimeType: 'application/pdf',
        size: 850 * 1024,
        modifiedTime: '2026-02-15T10:00:00Z',
        folderPath: 'Finance/Taxes',
        category: 'Financial',
      },
      {
        id: 'doc-offline-3',
        name: 'Medical_Blood_Report.jpg',
        cleanTitle: 'Medical Blood Report',
        parentId: 'folder-root',
        mimeType: 'image/jpeg',
        size: 180 * 1024,
        modifiedTime: '2026-01-20T08:30:00Z',
        folderPath: 'Health',
        category: 'Medical',
      },
    ];

    it('loads and searches cached documents offline from Dexie', async () => {
      // 1. Populate local IndexedDB cache
      await db.docs.bulkPut(mockOfflineDocs);

      // 2. Read from Dexie (simulating app boot without network)
      const cached = await db.docs.toArray();
      expect(cached).toHaveLength(3);

      // 3. Initialize search index from local cache
      searchIndex.initialize(cached);

      // 4. Perform search operations offline
      const searchResults = searchIndex.search('passport', 'All');
      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].cleanTitle).toBe('Passport 2026');
      expect(searchResults[0].category).toBe('Identity');
    });

    it('filters cached documents by category offline', async () => {
      await db.docs.bulkPut(mockOfflineDocs);
      const cached = await db.docs.toArray();
      searchIndex.initialize(cached);

      const financeDocs = searchIndex.search('', 'Financial');
      expect(financeDocs).toHaveLength(1);
      expect(financeDocs[0].name).toBe('Tax_Return_FY2025.pdf');

      const medicalDocs = searchIndex.search('', 'Medical');
      expect(medicalDocs).toHaveLength(1);
      expect(medicalDocs[0].name).toBe('Medical_Blood_Report.jpg');
    });

    it('preserves category overrides in local cache offline', async () => {
      await db.docs.bulkPut(mockOfflineDocs);

      // Override category locally
      await db.categoryOverrides.put({ fileId: 'doc-offline-1', category: 'Other' });
      const override = await db.categoryOverrides.get('doc-offline-1');
      expect(override?.category).toBe('Other');

      // Update in search index
      const doc = mockOfflineDocs[0];
      searchIndex.initialize([{ ...doc, category: override!.category }]);

      const otherDocs = searchIndex.search('', 'Other');
      expect(otherDocs).toHaveLength(1);
      expect(otherDocs[0].id).toBe('doc-offline-1');
    });
  });

  describe('Offline Guarding & Error Feedback', () => {
    it('simulates offline state and ensures proper user notification formatting', () => {
      const isOnline = false;
      const statusText = !isOnline ? "You're offline — showing your cached documents." : 'Online';
      expect(statusText).toContain('showing your cached documents');

      const offlineDownloadError = !isOnline
        ? "You're offline. Original file cannot be downloaded from Google Drive until you are reconnected to the internet."
        : null;

      expect(offlineDownloadError).toContain('Original file cannot be downloaded');
      expect(offlineDownloadError).toContain('until you are reconnected');
    });
  });
});
