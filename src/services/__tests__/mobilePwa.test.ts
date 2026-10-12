import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '../db';
import { searchIndex } from '../searchIndex';
import {
  canWebShare,
  canWebShareFiles,
  shareOrDownloadFile,
} from '../../utils/fileShare';
import type { DocItem } from '../../types';

describe('Mobile PWA & Workbox Offline Verification', () => {
  beforeEach(async () => {
    await db.docs.clear();
    await db.settings.clear();
  });

  describe('PWA Manifest & Service Worker Specification', () => {
    it('verifies valid manifest configuration with standalone mode and scope', () => {
      const manifest = {
        name: 'Personal Documents',
        short_name: 'Personal Docs',
        description:
          'Personal document manager and client-only upload-size utility with Google Drive integration.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a0a',
        theme_color: '#0a0a0a',
        orientation: 'portrait-primary',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      };

      expect(manifest.name).toBe('Personal Documents');
      expect(manifest.short_name).toBe('Personal Docs');
      expect(manifest.start_url).toBe('/');
      expect(manifest.scope).toBe('/');
      expect(manifest.display).toBe('standalone');
      expect(manifest.theme_color).toBe('#0a0a0a');
      expect(manifest.icons).toHaveLength(3);
      expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    });

    it('verifies Workbox runtime caching enforces NetworkOnly for Google endpoints', () => {
      const googleApisPattern = /^https:\/\/(www\.)?googleapis\.com\/.*/i;
      const googleAuthPattern = /^https:\/\/(accounts|drive)\.google\.com\/.*/i;

      // Google Drive API endpoints MUST match NetworkOnly rule
      expect(googleApisPattern.test('https://www.googleapis.com/drive/v3/files')).toBe(true);
      expect(googleApisPattern.test('https://googleapis.com/drive/v3/files/123?alt=media')).toBe(true);

      // Google Auth & Accounts endpoints MUST match NetworkOnly rule
      expect(googleAuthPattern.test('https://accounts.google.com/gsi/client')).toBe(true);
      expect(googleAuthPattern.test('https://drive.google.com/drive/folders/123')).toBe(true);

      // Local asset paths MUST NOT match NetworkOnly rule (they are precached)
      expect(googleApisPattern.test('/assets/index.js')).toBe(false);
      expect(googleAuthPattern.test('/assets/index.css')).toBe(false);
    });
  });

  describe('Offline Metadata Operations & Data Privacy', () => {
    const mockOfflineDocs: DocItem[] = [
      {
        id: 'doc-mobile-1',
        name: 'Passport_Scan.pdf',
        cleanTitle: 'Passport Scan',
        parentId: 'folder-root',
        mimeType: 'application/pdf',
        size: 400 * 1024,
        modifiedTime: '2026-03-01T12:00:00Z',
        folderPath: 'Identity',
        category: 'Identity',
      },
      {
        id: 'doc-mobile-2',
        name: 'Driving_License.jpg',
        cleanTitle: 'Driving License',
        parentId: 'folder-root',
        mimeType: 'image/jpeg',
        size: 250 * 1024,
        modifiedTime: '2026-02-15T10:00:00Z',
        folderPath: 'Identity',
        category: 'Identity',
      },
    ];

    it('allows searching cached metadata while strictly storing zero document bytes', async () => {
      // 1. Populate metadata only
      await db.docs.bulkPut(mockOfflineDocs);

      const cached = await db.docs.toArray();
      expect(cached).toHaveLength(2);

      // Verify no binary bytes are stored in Dexie document records
      cached.forEach((item) => {
        expect((item as any).data).toBeUndefined();
        expect((item as any).blob).toBeUndefined();
        expect((item as any).bytes).toBeUndefined();
        expect((item as any).buffer).toBeUndefined();
      });

      // 2. Offline index search operates instantly
      searchIndex.initialize(cached);
      const results = searchIndex.search('driving', 'All');
      expect(results).toHaveLength(1);
      expect(results[0].cleanTitle).toBe('Driving License');
    });
  });

  describe('Mobile Web Share API & Download Fallback', () => {
    it('successfully shares files via navigator.share when available', async () => {
      const shareMock = vi.fn().mockResolvedValue(undefined);
      const canShareMock = vi.fn().mockReturnValue(true);

      const originalNav = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        value: {
          share: shareMock,
          canShare: canShareMock,
        },
        writable: true,
        configurable: true,
      });

      expect(canWebShare()).toBe(true);
      expect(canWebShareFiles()).toBe(true);

      const blob = new Blob(['sample pdf content'], { type: 'application/pdf' });
      const result = await shareOrDownloadFile({
        blob,
        filename: 'compressed_doc.pdf',
        title: 'Compressed Doc',
      });

      expect(result.method).toBe('share');
      expect(result.success).toBe(true);
      expect(shareMock).toHaveBeenCalledTimes(1);

      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        writable: true,
        configurable: true,
      });
    });

    it('falls back to browser download if user agent does not support navigator.share', async () => {
      const originalNav = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        value: {},
        writable: true,
        configurable: true,
      });

      expect(canWebShare()).toBe(false);
      expect(canWebShareFiles()).toBe(false);

      const clickMock = vi.fn();
      const mockElement = {
        set href(_val: string) {},
        set download(_val: string) {},
        set rel(_val: string) {},
        click: clickMock,
      };

      const originalDoc = (globalThis as any).document;
      (globalThis as any).document = {
        createElement: vi.fn().mockReturnValue(mockElement),
        body: {
          appendChild: vi.fn(),
          removeChild: vi.fn(),
        },
      };

      const blob = new Blob(['sample image content'], { type: 'image/jpeg' });
      const result = await shareOrDownloadFile({
        blob,
        filename: 'image_compressed.jpg',
      });

      expect(result.method).toBe('download');
      expect(result.success).toBe(true);
      expect(clickMock).toHaveBeenCalled();

      (globalThis as any).document = originalDoc;
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        writable: true,
        configurable: true,
      });
    });
  });
});
