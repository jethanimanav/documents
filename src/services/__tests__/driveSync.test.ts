import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DriveSyncService } from '../driveSync';
import { db } from '../db';
import { searchIndex } from '../searchIndex';
import type { DocItem } from '../../types';
import * as driveFetchModule from '../driveFetch';

// Mock driveFetch
vi.mock('../driveFetch', () => ({
  driveFetch: vi.fn(),
}));

describe('DriveSyncService - Recursive Walk & Changes Sync', () => {
  let syncService: DriveSyncService;
  const mockDriveFetch = vi.mocked(driveFetchModule.driveFetch);

  beforeEach(async () => {
    vi.restoreAllMocks();
    syncService = new DriveSyncService();
    // Clear Dexie tables in memory
    try {
      await db.docs.clear();
      await db.categoryOverrides.clear();
      await db.folders.clear();
      await db.settings.clear();
    } catch {
      // In case IndexedDB is mock-only
    }
    searchIndex.initialize([]);
  });

  describe('Full Recursive Sync', () => {
    it('handles empty root folder gracefully', async () => {
      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files/root-123')) {
          return new Response(
            JSON.stringify({ id: 'root-123', name: 'Personal Documents Test', trashed: false }),
            { status: 200 }
          );
        }
        if (urlStr.includes('startPageToken')) {
          return new Response(JSON.stringify({ startPageToken: 'start-token-1' }), {
            status: 200,
          });
        }
        // Folder query returns 0 files
        return new Response(JSON.stringify({ files: [], nextPageToken: undefined }), {
          status: 200,
        });
      });

      await syncService.performFullSync('root-123');
      const progress = syncService.getProgress();
      expect(progress.foldersDiscovered).toBe(1);
      expect(progress.docsDiscovered).toBe(0);
      expect(searchIndex.getCount()).toBe(0);
    });

    it('indexes single file in test folder ("Personal Documents Test / Test_Aadhar.pdf")', async () => {
      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files/root-123')) {
          return new Response(
            JSON.stringify({ id: 'root-123', name: 'Personal Documents Test', trashed: false }),
            { status: 200 }
          );
        }
        if (urlStr.includes('startPageToken')) {
          return new Response(JSON.stringify({ startPageToken: 'token-abc' }), { status: 200 });
        }
        // Returns Test_Aadhar.pdf
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'file-aadhar-1',
                name: 'Test_Aadhar.pdf',
                mimeType: 'application/pdf',
                size: '254800', // string from Drive
                parents: ['root-123'],
                modifiedTime: '2024-01-01T10:00:00Z',
              },
            ],
            nextPageToken: undefined,
          }),
          { status: 200 }
        );
      });

      await syncService.performFullSync('root-123');

      expect(searchIndex.getCount()).toBe(1);
      const doc = searchIndex.getDoc('file-aadhar-1');
      expect(doc).toBeDefined();
      expect(doc?.cleanTitle).toBe('Test Aadhar');
      expect(doc?.size).toBe(254800); // parsed to number
      expect(doc?.category).toBe('Identity');
      expect(doc?.folderPath).toBe('Personal Documents Test');
    });

    it('walks nested folders and constructs hierarchical folder paths', async () => {
      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files/root-123')) {
          return new Response(
            JSON.stringify({ id: 'root-123', name: 'Personal Documents Test', trashed: false }),
            { status: 200 }
          );
        }
        if (urlStr.includes('startPageToken')) {
          return new Response(JSON.stringify({ startPageToken: 'tok' }), { status: 200 });
        }

        // Query for root children: contains "Education" folder
        if (urlStr.includes("root-123'%20in%20parents") || urlStr.includes("root-123' in parents")) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  id: 'folder-edu',
                  name: 'Education',
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: ['root-123'],
                },
              ],
            }),
            { status: 200 }
          );
        }

        // Query for Education folder children: contains "10th_Marksheet.pdf"
        if (urlStr.includes("folder-edu'%20in%20parents") || urlStr.includes("folder-edu' in parents")) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  id: 'file-marksheet',
                  name: '10th_Marksheet.pdf',
                  mimeType: 'application/pdf',
                  size: '1500000',
                  parents: ['folder-edu'],
                },
              ],
            }),
            { status: 200 }
          );
        }

        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      });

      await syncService.performFullSync('root-123');

      const doc = searchIndex.getDoc('file-marksheet');
      expect(doc).toBeDefined();
      expect(doc?.folderPath).toBe('Personal Documents Test / Education');
      expect(doc?.category).toBe('Education');
    });

    it('follows pagination when nextPageToken is returned', async () => {
      let pageCount = 0;
      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files/root-123')) {
          return new Response(
            JSON.stringify({ id: 'root-123', name: 'Root', trashed: false }),
            { status: 200 }
          );
        }
        if (urlStr.includes('startPageToken')) {
          return new Response(JSON.stringify({ startPageToken: 'tok' }), { status: 200 });
        }

        if (urlStr.includes('pageToken=page-2')) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  id: 'file-p2',
                  name: 'File_Page2.pdf',
                  mimeType: 'application/pdf',
                  size: '100',
                },
              ],
              nextPageToken: undefined,
            }),
            { status: 200 }
          );
        }

        pageCount++;
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'file-p1',
                name: 'File_Page1.pdf',
                mimeType: 'application/pdf',
                size: '200',
              },
            ],
            nextPageToken: 'page-2',
          }),
          { status: 200 }
        );
      });

      await syncService.performFullSync('root-123');
      expect(searchIndex.getCount()).toBe(2);
      expect(searchIndex.getDoc('file-p1')).toBeDefined();
      expect(searchIndex.getDoc('file-p2')).toBeDefined();
    });

    it('skips Google-native files (Docs/Sheets) with no binary size', async () => {
      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files/root-123')) {
          return new Response(
            JSON.stringify({ id: 'root-123', name: 'Root', trashed: false }),
            { status: 200 }
          );
        }
        if (urlStr.includes('startPageToken')) {
          return new Response(JSON.stringify({ startPageToken: 'tok' }), { status: 200 });
        }

        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'gdoc-1',
                name: 'Notes',
                mimeType: 'application/vnd.google-apps.document',
              },
              {
                id: 'gsheet-1',
                name: 'Budget',
                mimeType: 'application/vnd.google-apps.spreadsheet',
              },
              {
                id: 'pdf-real',
                name: 'Doc.pdf',
                mimeType: 'application/pdf',
                size: '500',
              },
            ],
          }),
          { status: 200 }
        );
      });

      await syncService.performFullSync('root-123');
      expect(searchIndex.getCount()).toBe(1);
      expect(searchIndex.getDoc('pdf-real')).toBeDefined();
      expect(searchIndex.getDoc('gdoc-1')).toBeUndefined();
    });

    it('preserves manual category overrides across full sync', async () => {
      // Set manual override before sync
      await db.categoryOverrides.put({ fileId: 'doc-override-1', category: 'Government' });

      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files/root-123')) {
          return new Response(
            JSON.stringify({ id: 'root-123', name: 'Root', trashed: false }),
            { status: 200 }
          );
        }
        if (urlStr.includes('startPageToken')) {
          return new Response(JSON.stringify({ startPageToken: 'tok' }), { status: 200 });
        }

        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'doc-override-1',
                name: 'Bank_Statement.pdf', // Normally Financial
                mimeType: 'application/pdf',
                size: '500',
              },
            ],
          }),
          { status: 200 }
        );
      });

      await syncService.performFullSync('root-123');
      const doc = searchIndex.getDoc('doc-override-1');
      expect(doc?.category).toBe('Government'); // Manual override preserved!
    });
  });

  describe('Incremental Sync (Changes API)', () => {
    it('applies new file addition, modification, and deletion', async () => {
      // Setup known folder in db
      await db.folders.put({
        id: 'folder-sub',
        name: 'Identity',
        parentId: 'root-123',
        path: 'Root / Identity',
      });

      // Existing doc in search index
      const existingDoc: DocItem = {
        id: 'existing-file',
        name: 'Old_Name.pdf',
        cleanTitle: 'Old Name',
        folderPath: 'Root / Identity',
        parentId: 'folder-sub',
        category: 'Identity',
        mimeType: 'application/pdf',
        size: 100,
        modifiedTime: '2024-01-01T00:00:00Z',
      };
      searchIndex.initialize([existingDoc]);
      await db.docs.put(existingDoc);

      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('drive/v3/changes')) {
          return new Response(
            JSON.stringify({
              newStartPageToken: 'new-token-456',
              changes: [
                // 1. Modified existing file
                {
                  fileId: 'existing-file',
                  file: {
                    id: 'existing-file',
                    name: 'Updated_Name.pdf',
                    mimeType: 'application/pdf',
                    size: '200',
                    parents: ['folder-sub'],
                  },
                },
                // 2. New file in monitored folder
                {
                  fileId: 'new-file-1',
                  file: {
                    id: 'new-file-1',
                    name: 'Voter_ID.pdf',
                    mimeType: 'application/pdf',
                    size: '300',
                    parents: ['folder-sub'],
                  },
                },
                // 3. File in an unrelated outside folder (should be ignored)
                {
                  fileId: 'outside-file',
                  file: {
                    id: 'outside-file',
                    name: 'Secret.pdf',
                    mimeType: 'application/pdf',
                    size: '900',
                    parents: ['unrelated-folder'],
                  },
                },
              ],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      });

      const success = await syncService.performIncrementalSync('root-123', 'old-token-123');
      expect(success).toBe(true);

      // Verify updated doc
      const updated = searchIndex.getDoc('existing-file');
      expect(updated?.name).toBe('Updated_Name.pdf');
      expect(updated?.cleanTitle).toBe('Updated Name');
      expect(updated?.size).toBe(200);

      // Verify new doc added
      const newDoc = searchIndex.getDoc('new-file-1');
      expect(newDoc).toBeDefined();
      expect(newDoc?.cleanTitle).toBe('Voter ID');

      // Verify outside file ignored
      expect(searchIndex.getDoc('outside-file')).toBeUndefined();
    });

    it('removes deleted or trashed file during incremental sync', async () => {
      const docToDelete: DocItem = {
        id: 'file-to-delete',
        name: 'Obsolete.pdf',
        cleanTitle: 'Obsolete',
        folderPath: 'Root',
        parentId: 'root-123',
        category: 'Other',
        mimeType: 'application/pdf',
        size: 50,
        modifiedTime: '2024-01-01T00:00:00Z',
      };
      searchIndex.initialize([docToDelete]);
      await db.docs.put(docToDelete);

      mockDriveFetch.mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            newStartPageToken: 'token-next',
            changes: [
              {
                fileId: 'file-to-delete',
                removed: true,
              },
            ],
          }),
          { status: 200 }
        );
      });

      await syncService.performIncrementalSync('root-123', 'token-prev');
      expect(searchIndex.getDoc('file-to-delete')).toBeUndefined();
    });

    it('returns false when changes token is expired (HTTP 410)', async () => {
      mockDriveFetch.mockImplementation(async () => {
        return new Response('Token expired', { status: 410 });
      });

      const success = await syncService.performIncrementalSync('root-123', 'expired-token');
      expect(success).toBe(false); // Indicates fallback to full sync is required
    });
  });

  describe('Edge cases and error handling', () => {
    it('handles duplicate filenames located in different folders correctly', async () => {
      mockDriveFetch.mockImplementation(async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('files/root-123')) {
          return new Response(
            JSON.stringify({ id: 'root-123', name: 'Root', trashed: false }),
            { status: 200 }
          );
        }
        if (urlStr.includes('startPageToken')) {
          return new Response(JSON.stringify({ startPageToken: 'tok' }), { status: 200 });
        }

        // Returns two distinct files that share the exact same filename "Certificate.pdf"
        return new Response(
          JSON.stringify({
            files: [
              {
                id: 'cert-school-1',
                name: 'Certificate.pdf',
                mimeType: 'application/pdf',
                size: '1000',
                parents: ['root-123'],
              },
              {
                id: 'cert-college-2',
                name: 'Certificate.pdf',
                mimeType: 'application/pdf',
                size: '2000',
                parents: ['root-123'],
              },
            ],
          }),
          { status: 200 }
        );
      });

      await syncService.performFullSync('root-123');
      expect(searchIndex.getCount()).toBe(2);
      expect(searchIndex.getDoc('cert-school-1')?.size).toBe(1000);
      expect(searchIndex.getDoc('cert-college-2')?.size).toBe(2000);
    });

    it('throws descriptive error if root folder is trashed or not found', async () => {
      mockDriveFetch.mockImplementation(async () => {
        return new Response(JSON.stringify({ id: 'bad-root', trashed: true }), { status: 200 });
      });

      await expect(syncService.performFullSync('bad-root')).rejects.toThrow(
        /is in the trash/
      );
    });
  });
});
