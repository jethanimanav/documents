import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  getDocumentDetails,
  saveDocumentDetails,
  deleteDocumentDetails,
  getAllDocumentDetails,
  setCategoryOverride,
  getAllCategoryOverrides,
  type DocumentDetailRecord,
} from '../db';
import {
  calculateExpiryStatus,
  formatDisplayDate,
  parseLocalDate,
} from '../../utils/documentDetails';

describe('Milestone 3 — Document Details & Expiry Reminders', () => {
  beforeEach(async () => {
    await db.documentDetails.clear();
    await db.categoryOverrides.clear();
    await db.docs.clear();
  });

  describe('Storage Schema & Persistence (Dexie v3)', () => {
    it('persists and retrieves user notes, custom tags, and expiry settings by Drive file ID', async () => {
      const fileId = 'drive-file-abc-123';
      const record: DocumentDetailRecord = {
        fileId,
        notes: 'Annual renewal required. Account #987654321.',
        labels: ['KYC', 'Official', 'Priority'],
        expiryDate: '2026-12-31',
        reminderLeadDays: 30,
        isDismissed: false,
        updatedAt: Date.now(),
      };

      await saveDocumentDetails(record);
      const retrieved = await getDocumentDetails(fileId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.fileId).toBe(fileId);
      expect(retrieved?.notes).toBe(record.notes);
      expect(retrieved?.labels).toEqual(['KYC', 'Official', 'Priority']);
      expect(retrieved?.expiryDate).toBe('2026-12-31');
      expect(retrieved?.reminderLeadDays).toBe(30);
      expect(retrieved?.isDismissed).toBe(false);

      // Verify no document bytes or blobs are saved in the record
      expect((retrieved as any).bytes).toBeUndefined();
      expect((retrieved as any).blob).toBeUndefined();
    });

    it('preserves existing category overrides while saving document details', async () => {
      const fileId = 'doc-with-category';
      await setCategoryOverride(fileId, 'Insurance');

      const record: DocumentDetailRecord = {
        fileId,
        notes: 'Car insurance policy policyholder note',
        labels: ['Vehicle'],
        updatedAt: Date.now(),
      };
      await saveDocumentDetails(record);

      const overrides = await getAllCategoryOverrides();
      expect(overrides.get(fileId)).toBe('Insurance');

      const details = await getDocumentDetails(fileId);
      expect(details?.notes).toBe('Car insurance policy policyholder note');
    });

    it('updates and deletes document details cleanly', async () => {
      const fileId = 'doc-to-delete-details';
      await saveDocumentDetails({
        fileId,
        notes: 'Temporary note',
        updatedAt: Date.now(),
      });

      let retrieved = await getDocumentDetails(fileId);
      expect(retrieved?.notes).toBe('Temporary note');

      await deleteDocumentDetails(fileId);
      retrieved = await getDocumentDetails(fileId);
      expect(retrieved).toBeUndefined();
    });

    it('handles documents deleted from Drive without deleting user notes', async () => {
      const deletedDriveFileId = 'drive-deleted-doc-999';
      await saveDocumentDetails({
        fileId: deletedDriveFileId,
        notes: 'Preserved note for historical reference',
        labels: ['Archived'],
        updatedAt: Date.now(),
      });

      // Drive docs cache is cleared (e.g. resync finds file was deleted)
      await db.docs.clear();

      // Personal notes must remain safe in IndexedDB
      const allDetails = await getAllDocumentDetails();
      expect(allDetails).toHaveLength(1);
      expect(allDetails[0].fileId).toBe(deletedDriveFileId);
      expect(allDetails[0].notes).toBe('Preserved note for historical reference');
    });
  });

  describe('Timezone-Safe Date Math & Expiry Calculation', () => {
    const fixedReferenceDate = new Date(2026, 5, 15); // June 15, 2026 local time

    it('parses YYYY-MM-DD into local date without UTC drift', () => {
      const date = parseLocalDate('2026-06-15');
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(5); // 0-based June
      expect(date.getDate()).toBe(15);
    });

    it('formats display date correctly', () => {
      const formatted = formatDisplayDate('2026-06-15');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('15');
    });

    it('identifies expired documents accurately', () => {
      // 5 days before reference date: June 10, 2026
      const result = calculateExpiryStatus('2026-06-10', 30, fixedReferenceDate);
      expect(result.status).toBe('expired');
      expect(result.daysRemaining).toBe(-5);
      expect(result.label).toBe('Expired 5 days ago');
    });

    it('identifies document expiring today', () => {
      const result = calculateExpiryStatus('2026-06-15', 30, fixedReferenceDate);
      expect(result.status).toBe('upcoming');
      expect(result.daysRemaining).toBe(0);
      expect(result.label).toBe('Expires today');
    });

    it('identifies upcoming document within lead time', () => {
      // 10 days after reference date: June 25, 2026 (lead time = 30 days)
      const result = calculateExpiryStatus('2026-06-25', 30, fixedReferenceDate);
      expect(result.status).toBe('upcoming');
      expect(result.daysRemaining).toBe(10);
      expect(result.label).toBe('Expires in 10 days');
    });

    it('identifies active document beyond lead time', () => {
      // 60 days after reference date: August 14, 2026 (lead time = 30 days)
      const result = calculateExpiryStatus('2026-08-14', 30, fixedReferenceDate);
      expect(result.status).toBe('active');
      expect(result.daysRemaining).toBe(60);
      expect(result.label).toBe('Expires in 60 days');
    });

    it('handles missing or malformed expiry dates gracefully', () => {
      expect(calculateExpiryStatus(undefined).status).toBe('none');
      expect(calculateExpiryStatus('').status).toBe('none');
      expect(calculateExpiryStatus('invalid-date').status).toBe('none');
    });
  });
});
