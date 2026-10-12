import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  mergePdfs,
  deletePages,
  extractPages,
  rotatePages,
  reorderPages,
  modifyPdfPages,
  parsePageRanges,
  imagesToPdf,
} from '../pdfTools';
import { validatePdfOutput } from '../pdfCompression';

// Helper to construct multi-page in-memory PDFs with distinct page content
async function createNumberedPdf(pageCount: number, docLabel: string = 'Doc'): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pageCount; i++) {
    const page = doc.addPage([400, 600]);
    page.drawText(`${docLabel} - Page ${i}`, {
      x: 50,
      y: 500,
      size: 16,
      font,
    });
  }

  const bytes = await doc.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

// Helper to read text from pages via PDF.js to verify page order
async function readPageTexts(blob: Blob): Promise<string[]> {
  const buf = await blob.arrayBuffer();
  const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
  const pdf = await task.promise;
  const texts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const str = content.items.map((item: any) => item.str).join(' ');
    texts.push(str);
  }

  return texts;
}

// Helper to inspect page rotations via pdf-lib
async function getPageRotations(blob: Blob): Promise<number[]> {
  const buf = await blob.arrayBuffer();
  const doc = await PDFDocument.load(new Uint8Array(buf));
  const rotations: number[] = [];
  const count = doc.getPageCount();

  for (let i = 0; i < count; i++) {
    rotations.push(doc.getPage(i).getRotation().angle);
  }

  return rotations;
}

describe('PDF Tools (Step 5)', () => {
  describe('MERGE PDFs', () => {
    it('merges 2 PDFs successfully', async () => {
      const pdfA = await createNumberedPdf(2, 'FileA');
      const pdfB = await createNumberedPdf(3, 'FileB');

      const result = await mergePdfs([
        { name: 'FileA.pdf', blob: pdfA },
        { name: 'FileB.pdf', blob: pdfB },
      ]);

      expect(result.pageCount).toBe(5);
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.blob.type).toBe('application/pdf');

      // Verify reopening with PDF.js
      const isValid = await validatePdfOutput(result.blob, 5);
      expect(isValid).toBe(true);
    });

    it('merges 3 PDFs successfully', async () => {
      const pdf1 = await createNumberedPdf(1, 'Doc1');
      const pdf2 = await createNumberedPdf(2, 'Doc2');
      const pdf3 = await createNumberedPdf(3, 'Doc3');

      const result = await mergePdfs([
        { name: 'Doc1.pdf', blob: pdf1 },
        { name: 'Doc2.pdf', blob: pdf2 },
        { name: 'Doc3.pdf', blob: pdf3 },
      ]);

      expect(result.pageCount).toBe(6);
      const isValid = await validatePdfOutput(result.blob, 6);
      expect(isValid).toBe(true);
    });

    it('preserves exact page order when merging', async () => {
      const pdfA = await createNumberedPdf(2, 'OrderA');
      const pdfB = await createNumberedPdf(1, 'OrderB');

      const result = await mergePdfs([
        { name: 'OrderA.pdf', blob: pdfA },
        { name: 'OrderB.pdf', blob: pdfB },
      ]);

      const texts = await readPageTexts(result.blob);
      expect(texts).toHaveLength(3);
      expect(texts[0]).toContain('OrderA - Page 1');
      expect(texts[1]).toContain('OrderA - Page 2');
      expect(texts[2]).toContain('OrderB - Page 1');
    });

    it('tracks output page count accurately and rejects fewer than 2 sources', async () => {
      const pdfA = await createNumberedPdf(1, 'Solo');

      await expect(
        mergePdfs([{ name: 'Solo.pdf', blob: pdfA }])
      ).rejects.toThrow('Please select at least 2 PDF documents to merge.');
    });
  });

  describe('DELETE Pages', () => {
    it('deletes selected pages and produces correct page count', async () => {
      const pdf = await createNumberedPdf(5, 'DeleteDoc');

      // Delete page 2 (index 1) and page 4 (index 3)
      const result = await deletePages(pdf, [1, 3]);

      expect(result.pageCount).toBe(3);
      const texts = await readPageTexts(result.blob);
      expect(texts).toHaveLength(3);
      expect(texts[0]).toContain('Page 1');
      expect(texts[1]).toContain('Page 3');
      expect(texts[2]).toContain('Page 5');

      const isValid = await validatePdfOutput(result.blob, 3);
      expect(isValid).toBe(true);
    });

    it('cannot delete every page (prevents 0-page PDF)', async () => {
      const pdf = await createNumberedPdf(2, 'FullDelete');

      // Attempt to delete all pages (indices 0 and 1)
      await expect(deletePages(pdf, [0, 1])).rejects.toThrow(
        'Cannot delete all pages. A PDF must have at least one page.'
      );
    });
  });

  describe('EXTRACT Pages', () => {
    it('extracts selected pages with correct page count and order', async () => {
      const pdf = await createNumberedPdf(5, 'ExtractDoc');

      // Extract pages 4 and 2 in that specific order (indices 3 and 1)
      const result = await extractPages(pdf, [3, 1]);

      expect(result.pageCount).toBe(2);
      const texts = await readPageTexts(result.blob);
      expect(texts).toHaveLength(2);
      expect(texts[0]).toContain('Page 4');
      expect(texts[1]).toContain('Page 2');

      const isValid = await validatePdfOutput(result.blob, 2);
      expect(isValid).toBe(true);
    });

    it('rejects empty extraction selection', async () => {
      const pdf = await createNumberedPdf(3, 'EmptyExtract');

      await expect(extractPages(pdf, [])).rejects.toThrow(
        'Please select at least one page to extract.'
      );
    });
  });

  describe('ROTATE Pages', () => {
    it('rotates pages by 90°, 180°, and 270° accurately', async () => {
      const pdf = await createNumberedPdf(4, 'RotateDoc');

      // Rotate:
      // Page 1 (index 0): +90°
      // Page 2 (index 1): +180°
      // Page 3 (index 2): +270°
      // Page 4 (index 3): 0° (unchanged)
      const rotations = {
        0: 90,
        1: 180,
        2: 270,
        3: 0,
      };

      const result = await rotatePages(pdf, rotations);
      expect(result.pageCount).toBe(4);

      const angles = await getPageRotations(result.blob);
      expect(angles[0]).toBe(90);
      expect(angles[1]).toBe(180);
      expect(angles[2]).toBe(270);
      expect(angles[3]).toBe(0);

      const isValid = await validatePdfOutput(result.blob, 4);
      expect(isValid).toBe(true);
    });
  });

  describe('REORDER Pages', () => {
    it('reorders pages into the exact requested order', async () => {
      const pdf = await createNumberedPdf(3, 'ReorderDoc');

      // Reorder from [0, 1, 2] to [2, 0, 1]
      const result = await reorderPages(pdf, [2, 0, 1]);

      expect(result.pageCount).toBe(3);
      const texts = await readPageTexts(result.blob);
      expect(texts[0]).toContain('Page 3');
      expect(texts[1]).toContain('Page 1');
      expect(texts[2]).toContain('Page 2');

      const isValid = await validatePdfOutput(result.blob, 3);
      expect(isValid).toBe(true);
    });
  });

  describe('OUTPUT VALIDATION', () => {
    it('verifies generated PDF can be reopened with PDF.js', async () => {
      const pdf = await createNumberedPdf(2, 'ValidDoc');
      const result = await modifyPdfPages(pdf, [
        { originalIndex: 1, rotationDelta: 90 },
        { originalIndex: 0, rotationDelta: 0 },
      ]);

      const isValid = await validatePdfOutput(result.blob, 2);
      expect(isValid).toBe(true);
    });

    it('rejects corrupted output', async () => {
      const corruptedBlob = new Blob(['not a valid pdf content'], { type: 'application/pdf' });
      await expect(validatePdfOutput(corruptedBlob, 1)).rejects.toThrow();
    });

    it('rejects empty blob or page count mismatch during validation', async () => {
      const emptyBlob = new Blob([], { type: 'application/pdf' });
      await expect(validatePdfOutput(emptyBlob, 0)).rejects.toThrow('Empty output blob');

      const pdf = await createNumberedPdf(2, 'MismatchDoc');
      await expect(validatePdfOutput(pdf, 5)).rejects.toThrow('Page count mismatch');
    });
  });

  describe('PAGE RANGE PARSER (Milestone 4)', () => {
    it('parses simple ranges and individual page numbers', () => {
      expect(parsePageRanges('1-3, 5', 5)).toEqual([0, 1, 2, 4]);
      expect(parsePageRanges('2, 4', 5)).toEqual([1, 3]);
      expect(parsePageRanges('1', 3)).toEqual([0]);
    });

    it('handles extra whitespace and trailing commas cleanly', () => {
      expect(parsePageRanges('  1 - 2 ,   4  ,  ', 6)).toEqual([0, 1, 3]);
    });

    it('deduplicates overlapping ranges and preserves sorted order', () => {
      expect(parsePageRanges('1-3, 2, 3-4', 5)).toEqual([0, 1, 2, 3]);
    });

    it('returns empty array on empty or whitespace strings', () => {
      expect(parsePageRanges('', 5)).toEqual([]);
      expect(parsePageRanges('   ', 5)).toEqual([]);
    });

    it('throws on out-of-bounds page numbers', () => {
      expect(() => parsePageRanges('0', 5)).toThrow('out of bounds');
      expect(() => parsePageRanges('6', 5)).toThrow('out of bounds');
      expect(() => parsePageRanges('1-7', 5)).toThrow('out of bounds');
    });

    it('throws on inverted ranges (start > end)', () => {
      expect(() => parsePageRanges('5-3', 5)).toThrow('cannot be greater than');
    });

    it('throws on invalid syntax', () => {
      expect(() => parsePageRanges('abc', 5)).toThrow('Invalid page number');
      expect(() => parsePageRanges('1-2-3', 5)).toThrow('Invalid range format');
    });
  });

  describe('CONVERT IMAGES TO PDF (Milestone 4)', () => {
    const TINY_PNG_BASE64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEjAwMDAwAFAAC/0w0l0kAAAAASUVORK5CYII=';

    function createMockPngBlob(): Blob {
      const binaryString = atob(TINY_PNG_BASE64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new Blob([bytes], { type: 'image/png' });
    }

    it('converts a single image into a valid 1-page PDF', async () => {
      const imgBlob = createMockPngBlob();
      const result = await imagesToPdf([
        { name: 'photo1.png', blob: imgBlob },
      ]);

      expect(result.pageCount).toBe(1);
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.blob.type).toBe('application/pdf');

      const isValid = await validatePdfOutput(result.blob, 1);
      expect(isValid).toBe(true);
    });

    it('converts multiple images into a multi-page PDF preserving sequence', async () => {
      const img1 = createMockPngBlob();
      const img2 = createMockPngBlob();
      const img3 = createMockPngBlob();

      const result = await imagesToPdf([
        { name: 'page1.png', blob: img1 },
        { name: 'page2.png', blob: img2 },
        { name: 'page3.png', blob: img3 },
      ]);

      expect(result.pageCount).toBe(3);
      expect(result.originalBytes).toBeGreaterThan(0);
      expect(result.outputBytes).toBeGreaterThan(0);

      const isValid = await validatePdfOutput(result.blob, 3);
      expect(isValid).toBe(true);
    });

    it('respects orientation, margin, and fit configurations', async () => {
      const img = createMockPngBlob();

      // Portrait with normal margin and fit
      const portraitResult = await imagesToPdf(
        [{ name: 'doc.png', blob: img }],
        { orientation: 'portrait', margin: 'normal', fit: 'fit' }
      );
      expect(portraitResult.pageCount).toBe(1);
      await expect(validatePdfOutput(portraitResult.blob, 1)).resolves.toBe(true);

      // Landscape with zero margin and fill
      const landscapeResult = await imagesToPdf(
        [{ name: 'doc.png', blob: img }],
        { orientation: 'landscape', margin: 'none', fit: 'fill' }
      );
      expect(landscapeResult.pageCount).toBe(1);
      await expect(validatePdfOutput(landscapeResult.blob, 1)).resolves.toBe(true);
    });

    it('throws when images array is empty', async () => {
      await expect(imagesToPdf([])).rejects.toThrow('Please select at least one image');
    });
  });
});
