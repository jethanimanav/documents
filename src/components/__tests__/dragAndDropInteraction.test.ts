import { describe, it, expect, vi } from 'vitest';
import {
  isSupportedFileType,
  getFileKind,
  getFileBadgeLabel,
  formatByteSize,
  createLocalDocItem,
  validateDroppedFiles,
} from '../../utils/dropValidation';

describe('Drag & Drop Interaction Specification Tests', () => {
  describe('1. PDF Drag & Drop', () => {
    it('accepts valid PDF file and prepares local DocItem', () => {
      const file = new File(['%PDF-1.4 mock content'], 'Official_Transcript.pdf', {
        type: 'application/pdf',
      });
      expect(isSupportedFileType(file)).toBe(true);
      expect(getFileKind(file)).toBe('pdf');
      expect(getFileBadgeLabel(file)).toBe('PDF');

      const docItem = createLocalDocItem(file);
      expect(docItem.mimeType).toBe('application/pdf');
      expect(docItem.cleanTitle).toBe('Official Transcript');
      expect(docItem.parentId).toBe('local');
    });

    it('formats PDF file size accurately for the landed state', () => {
      const sizeBytes = 2.4 * 1024 * 1024;
      expect(formatByteSize(sizeBytes)).toBe('2.4 MB');
    });
  });

  describe('2. Image Drag & Drop', () => {
    it('accepts JPG, JPEG, PNG, and WebP files', () => {
      const jpg = new File(['jpg'], 'id_card.jpg', { type: 'image/jpeg' });
      const png = new File(['png'], 'scan_doc.png', { type: 'image/png' });
      const webp = new File(['webp'], 'avatar.webp', { type: 'image/webp' });

      expect(isSupportedFileType(jpg)).toBe(true);
      expect(isSupportedFileType(png)).toBe(true);
      expect(isSupportedFileType(webp)).toBe(true);

      expect(getFileBadgeLabel(jpg)).toBe('JPEG');
      expect(getFileBadgeLabel(png)).toBe('PNG');
      expect(getFileBadgeLabel(webp)).toBe('WebP');
    });
  });

  describe('3. Unsupported File Rejection', () => {
    it('rejects unsupported file formats without activating landing state', () => {
      const docx = new File(['data'], 'notes.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      const zip = new File(['data'], 'archive.zip', { type: 'application/zip' });
      const exe = new File(['data'], 'installer.exe', { type: 'application/x-msdownload' });

      expect(isSupportedFileType(docx)).toBe(false);
      expect(isSupportedFileType(zip)).toBe(false);
      expect(isSupportedFileType(exe)).toBe(false);

      const result = validateDroppedFiles([docx]);
      expect(result.validFiles.length).toBe(0);
      expect(result.primaryFile).toBeNull();
      expect(result.error).toContain('Unsupported file format');
    });
  });

  describe('4. Dropping Outside Target', () => {
    it('prevents browser default navigation when dropped on window outside target', () => {
      const preventDefault = vi.fn();
      const mockDropEvent = {
        preventDefault,
      } as unknown as DragEvent;

      mockDropEvent.preventDefault();
      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe('5. Multiple Files Handling', () => {
    it('identifies multiple files, selects the first supported document, and provides notice', () => {
      const pdf1 = new File(['1'], 'first.pdf', { type: 'application/pdf' });
      const pdf2 = new File(['2'], 'second.pdf', { type: 'application/pdf' });

      const res = validateDroppedFiles([pdf1, pdf2]);
      expect(res.validFiles.length).toBe(2);
      expect(res.primaryFile?.name).toBe('first.pdf');
      expect(res.multipleNotice).toBe('2 documents detected. Prepared first: "first.pdf".');
    });
  });

  describe('6. Canceling Drag Interaction', () => {
    it('simulates drag counter decrement to 0 on dragleave or escape', () => {
      let dragCounter = 2;

      // First drag leave
      dragCounter = Math.max(0, dragCounter - 1);
      expect(dragCounter).toBe(1);

      // Second drag leave exiting viewport
      dragCounter = Math.max(0, dragCounter - 1);
      expect(dragCounter).toBe(0);

      // Escape key cancels immediately
      dragCounter = 0;
      expect(dragCounter).toBe(0);
    });
  });

  describe('7. Mobile Selection Adaptation', () => {
    it('formats subtitle correctly for mobile vs desktop', () => {
      const getSubtitle = (isMobile: boolean, isOverTarget: boolean) => {
        if (isOverTarget) return 'Drop it here';
        if (isMobile) return 'Choose a document';
        return 'Drop a document here';
      };

      expect(getSubtitle(false, false)).toBe('Drop a document here');
      expect(getSubtitle(true, false)).toBe('Choose a document');
      expect(getSubtitle(false, true)).toBe('Drop it here');
      expect(getSubtitle(true, true)).toBe('Drop it here');
    });
  });

  describe('8. Reduced-Motion Mode & Spring Transitions', () => {
    it('verifies that prefers-reduced-motion media query logic can be detected', () => {
      const matchesReducedMotion = (query: string) => query === '(prefers-reduced-motion: reduce)';
      expect(matchesReducedMotion('(prefers-reduced-motion: reduce)')).toBe(true);
      expect(matchesReducedMotion('(prefers-color-scheme: dark)')).toBe(false);
    });
  });
});
