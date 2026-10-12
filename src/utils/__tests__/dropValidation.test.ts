import { describe, it, expect } from 'vitest';
import {
  isSupportedFileType,
  getFileKind,
  getFileBadgeLabel,
  formatByteSize,
  createLocalDocItem,
  validateDroppedFiles,
} from '../dropValidation';

describe('Drop Validation & File Type Utilities', () => {
  describe('isSupportedFileType', () => {
    it('accepts PDF files by MIME and extension', () => {
      expect(isSupportedFileType({ name: 'passport.pdf', type: 'application/pdf' })).toBe(true);
      expect(isSupportedFileType({ name: 'statement.PDF' })).toBe(true);
      expect(isSupportedFileType({ name: 'scan', type: 'application/pdf' })).toBe(true);
    });

    it('accepts JPG / JPEG files by MIME and extension', () => {
      expect(isSupportedFileType({ name: 'id_front.jpg', type: 'image/jpeg' })).toBe(true);
      expect(isSupportedFileType({ name: 'photo.JPEG' })).toBe(true);
      expect(isSupportedFileType({ name: 'camera_capture', type: 'image/jpeg' })).toBe(true);
    });

    it('accepts PNG files', () => {
      expect(isSupportedFileType({ name: 'receipt.png', type: 'image/png' })).toBe(true);
      expect(isSupportedFileType({ name: 'screenshot.PNG' })).toBe(true);
    });

    it('accepts WebP files', () => {
      expect(isSupportedFileType({ name: 'voucher.webp', type: 'image/webp' })).toBe(true);
      expect(isSupportedFileType({ name: 'doc.WEBP' })).toBe(true);
    });

    it('rejects unsupported files', () => {
      expect(isSupportedFileType({ name: 'document.docx' })).toBe(false);
      expect(isSupportedFileType({ name: 'spreadsheet.xlsx' })).toBe(false);
      expect(isSupportedFileType({ name: 'archive.zip' })).toBe(false);
      expect(isSupportedFileType({ name: 'script.exe' })).toBe(false);
      expect(isSupportedFileType({ name: 'notes.txt', type: 'text/plain' })).toBe(false);
      expect(isSupportedFileType({ name: 'video.mp4', type: 'video/mp4' })).toBe(false);
    });
  });

  describe('getFileKind & getFileBadgeLabel', () => {
    it('identifies PDF kind and label', () => {
      expect(getFileKind({ name: 'doc.pdf' })).toBe('pdf');
      expect(getFileBadgeLabel({ name: 'doc.pdf' })).toBe('PDF');
    });

    it('identifies image kinds and labels', () => {
      expect(getFileKind({ name: 'card.jpg' })).toBe('image');
      expect(getFileBadgeLabel({ name: 'card.jpg' })).toBe('JPEG');
      expect(getFileBadgeLabel({ name: 'card.png' })).toBe('PNG');
      expect(getFileBadgeLabel({ name: 'card.webp' })).toBe('WebP');
    });

    it('flags unsupported kinds', () => {
      expect(getFileKind({ name: 'program.exe' })).toBe('unsupported');
      expect(getFileBadgeLabel({ name: 'program.exe' })).toBe('FILE');
    });
  });

  describe('formatByteSize', () => {
    it('formats 0 and small byte counts', () => {
      expect(formatByteSize(0)).toBe('0 B');
      expect(formatByteSize(512)).toBe('512 B');
    });

    it('formats KB counts', () => {
      expect(formatByteSize(1024 * 50)).toBe('50 KB');
      expect(formatByteSize(1024 * 500)).toBe('500 KB');
    });

    it('formats MB counts nicely', () => {
      expect(formatByteSize(2.4 * 1024 * 1024)).toBe('2.4 MB');
      expect(formatByteSize(1 * 1024 * 1024)).toBe('1 MB');
      expect(formatByteSize(5 * 1024 * 1024)).toBe('5 MB');
    });
  });

  describe('createLocalDocItem', () => {
    it('constructs a valid DocItem from a File object', () => {
      const mockFile = new File(['mock content'], 'Employment_Letter.pdf', {
        type: 'application/pdf',
      });
      const docItem = createLocalDocItem(mockFile);

      expect(docItem.id).toMatch(/^local-/);
      expect(docItem.name).toBe('Employment_Letter.pdf');
      expect(docItem.cleanTitle).toBe('Employment Letter');
      expect(docItem.mimeType).toBe('application/pdf');
      expect(docItem.size).toBe(mockFile.size);
      expect(docItem.category).toBe('Other');
    });
  });

  describe('validateDroppedFiles', () => {
    it('handles empty drops gracefully', () => {
      const res = validateDroppedFiles([]);
      expect(res.validFiles.length).toBe(0);
      expect(res.primaryFile).toBeNull();
      expect(res.error).toBe('No files detected in drop.');
    });

    it('rejects unsupported files with clear error', () => {
      const badFile = new File(['xyz'], 'contract.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const res = validateDroppedFiles([badFile]);
      expect(res.validFiles.length).toBe(0);
      expect(res.primaryFile).toBeNull();
      expect(res.error).toBe('Unsupported file format. Please drop a PDF, JPG, PNG, or WebP document.');
    });

    it('accepts a single valid PDF', () => {
      const pdf = new File(['pdf data'], 'form16.pdf', { type: 'application/pdf' });
      const res = validateDroppedFiles([pdf]);
      expect(res.validFiles.length).toBe(1);
      expect(res.primaryFile?.name).toBe('form16.pdf');
      expect(res.error).toBeNull();
      expect(res.multipleNotice).toBeNull();
    });

    it('accepts a valid image', () => {
      const img = new File(['img data'], 'license.jpg', { type: 'image/jpeg' });
      const res = validateDroppedFiles([img]);
      expect(res.validFiles.length).toBe(1);
      expect(res.primaryFile?.name).toBe('license.jpg');
      expect(res.error).toBeNull();
    });

    it('handles multiple files by prioritizing first supported document and providing notice', () => {
      const pdf1 = new File(['1'], 'doc1.pdf', { type: 'application/pdf' });
      const img2 = new File(['2'], 'doc2.png', { type: 'image/png' });
      const bad = new File(['3'], 'ignore.zip', { type: 'application/zip' });

      const res = validateDroppedFiles([pdf1, img2, bad]);
      expect(res.validFiles.length).toBe(2);
      expect(res.primaryFile?.name).toBe('doc1.pdf');
      expect(res.multipleNotice).toContain('2 documents detected. Prepared first: "doc1.pdf".');
    });
  });
});
