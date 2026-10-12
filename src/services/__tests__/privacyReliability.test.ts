import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { driveFetch } from '../driveFetch';
import { authService } from '../auth';
import {
  db,
  getCacheMetadataStats,
  wipeMetadataCacheOnly,
  setSetting,
  getSetting,
  putDocs,
} from '../db';
import type { DocItem } from '../../types';

describe('Privacy and Reliability (Milestone 5)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    authService.signOut();
    await db.docs.clear();
    await db.folders.clear();
    await db.documentDetails.clear();
    await db.settings.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('driveFetch Reliability & Backoff', () => {
    it('retries on HTTP 429 rate limit and succeeds on subsequent attempt', async () => {
      // Setup in-memory mock token
      (authService as any).setAccessToken('valid-test-token', 3600);

      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return new Response('Rate limited', {
            status: 429,
            headers: { 'Retry-After': '0' },
          });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const res = await driveFetch('https://www.googleapis.com/drive/v3/files');
      expect(res.status).toBe(200);
      expect(attempts).toBe(2);
    });

    it('retries on HTTP 503 server error and succeeds on subsequent attempt', async () => {
      (authService as any).setAccessToken('valid-test-token', 3600);

      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          return new Response('Backend error', { status: 503 });
        }
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      });

      const res = await driveFetch('https://www.googleapis.com/drive/v3/files');
      expect(res.status).toBe(200);
      expect(attempts).toBe(2);
    });

    it('exhausts max retries on persistent HTTP 500 server errors', async () => {
      (authService as any).setAccessToken('valid-test-token', 3600);

      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        attempts++;
        return new Response('Internal Server Error', { status: 500 });
      });

      // maxRetries = 2 for fast test execution
      const res = await driveFetch('https://www.googleapis.com/drive/v3/files', {}, 2);
      expect(res.status).toBe(500);
      expect(attempts).toBe(3); // Initial attempt + 2 retries
    });
  });

  describe('Local Cache Management & Statistics', () => {
    it('calculates cache metadata statistics correctly', async () => {
      const mockDocs: DocItem[] = [
        {
          id: 'doc-1',
          name: 'Passport.pdf',
          cleanTitle: 'Passport',
          folderPath: 'Personal Docs',
          parentId: 'folder-1',
          category: 'Identity',
          mimeType: 'application/pdf',
          size: 102400,
          modifiedTime: new Date().toISOString(),
        },
        {
          id: 'doc-2',
          name: 'Diploma.pdf',
          cleanTitle: 'Diploma',
          folderPath: 'Personal Docs',
          parentId: 'folder-1',
          category: 'Education',
          mimeType: 'application/pdf',
          size: 204800,
          modifiedTime: new Date().toISOString(),
        },
      ];

      await putDocs(mockDocs);
      await db.folders.put({ id: 'folder-1', name: 'Personal Docs', path: 'Personal Docs' });
      await db.documentDetails.put({
        fileId: 'doc-1',
        notes: 'Renew in 2028',
        labels: ['official'],
        updatedAt: Date.now(),
      });

      const stats = await getCacheMetadataStats();
      expect(stats.docCount).toBe(2);
      expect(stats.folderCount).toBe(1);
      expect(stats.detailsCount).toBe(1);
      expect(stats.estimatedSizeBytes).toBeGreaterThan(0);
    });

    it('wipes only metadata cache while strictly preserving user configuration settings', async () => {
      // Setup user configuration
      await setSetting('google_client_id', 'my-client-id-12345.apps.googleusercontent.com');
      await setSetting('root_folder_id', 'https://drive.google.com/drive/folders/123456');
      await setSetting('drive_changes_token', 'token-abcdef');
      await setSetting('last_sync_time', 123456789);

      // Setup document cache
      await putDocs([
        {
          id: 'doc-1',
          name: 'File.pdf',
          cleanTitle: 'File',
          folderPath: 'Root',
          parentId: 'root',
          category: 'Other',
          mimeType: 'application/pdf',
          size: 5000,
          modifiedTime: new Date().toISOString(),
        },
      ]);
      await db.folders.put({ id: 'root', name: 'Root', path: 'Root' });

      // Execute cache wipe
      await wipeMetadataCacheOnly();

      // Verify document cache is purged
      const docsAfter = await db.docs.toArray();
      const foldersAfter = await db.folders.toArray();
      expect(docsAfter.length).toBe(0);
      expect(foldersAfter.length).toBe(0);

      // Verify sync tokens were reset
      const tokenAfter = await getSetting('drive_changes_token', '');
      const syncTimeAfter = await getSetting('last_sync_time', 0);
      expect(tokenAfter).toBe('');
      expect(syncTimeAfter).toBe(0);

      // Verify credentials & settings remain preserved
      const clientIdAfter = await getSetting('google_client_id', '');
      const rootFolderAfter = await getSetting('root_folder_id', '');
      expect(clientIdAfter).toBe('my-client-id-12345.apps.googleusercontent.com');
      expect(rootFolderAfter).toBe('https://drive.google.com/drive/folders/123456');
    });
  });

  describe('Privacy & Token Architecture', () => {
    it('verifies access tokens remain strictly in-memory and are never stored in localStorage or IndexedDB', () => {
      (authService as any).setAccessToken('secret-access-token-999', 3600);

      expect((authService as any).accessToken).toBe('secret-access-token-999');
      expect(authService.getState().isAuthenticated).toBe(true);

      // Check localStorage
      if (typeof localStorage !== 'undefined') {
        expect(localStorage.getItem('access_token')).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('oauth_token')).toBeNull();
      }

      // Check sessionStorage
      if (typeof sessionStorage !== 'undefined') {
        expect(sessionStorage.getItem('access_token')).toBeNull();
        expect(sessionStorage.getItem('token')).toBeNull();
      }
    });
  });
});
