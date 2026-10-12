import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  analyzePdf,
  validatePdfOutput,
  compressPdf,
} from '../pdfCompression';

// A valid, fully conforming 1x1 JFIF JPEG accepted by pdf-lib's JpegEmbedder
const VALID_1X1_JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
  0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
  0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
  0x00, 0xbf, 0x80, 0xff, 0xd9,
]);

// Helper to construct in-memory test PDFs with pdf-lib
async function createTestPdf(
  pages: number = 1,
  options?: {
    withText?: boolean;
    pageWidth?: number;
    pageHeight?: number;
    addDummyPaddingBytes?: number;
  }
): Promise<Blob> {
  const doc = await PDFDocument.create();
  const font = options?.withText ? await doc.embedFont(StandardFonts.Helvetica) : null;

  for (let i = 1; i <= pages; i++) {
    const w = options?.pageWidth || 595; // A4 pt width
    const h = options?.pageHeight || 842; // A4 pt height
    const page = doc.addPage([w, h]);

    if (options?.withText && font) {
      page.drawText(`Sample Selectable Text Page ${i} Government Certificate Document`, {
        x: 50,
        y: h - 100,
        size: 14,
        font,
      });
    }
  }

  const bytes = await doc.save();

  if (options?.addDummyPaddingBytes && options.addDummyPaddingBytes > 0) {
    // Append dummy comment at the end of PDF without breaking PDF structure
    const padding = new Uint8Array(options.addDummyPaddingBytes).fill(32);
    const combined = new Uint8Array(bytes.byteLength + padding.byteLength);
    combined.set(bytes, 0);
    combined.set(padding, bytes.byteLength);
    return new Blob([combined.buffer as ArrayBuffer], { type: 'application/pdf' });
  }

  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
}

// Mock canvas setup for Node/Vitest
function setupNodeCanvasMock() {
  const mockCtx = {
    canvas: null as any,
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    transform: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    clip: vi.fn(),
    rect: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(400) }),
    putImageData: vi.fn(),
  };

  class MockNodeOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
      mockCtx.canvas = this;
    }
    getContext() {
      return mockCtx;
    }
    async convertToBlob({ quality }: { type: string; quality: number }) {
      // Scale dummy bytes with quality for testing target ladder
      const byteCount = Math.max(VALID_1X1_JPEG.byteLength, Math.round(500 * quality));
      const res = new Uint8Array(byteCount);
      res.set(VALID_1X1_JPEG, 0);
      return new Blob([res.buffer as ArrayBuffer], { type: 'image/jpeg' });
    }
  }

  globalThis.OffscreenCanvas = MockNodeOffscreenCanvas as any;
}

describe('PDF Compression Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupNodeCanvasMock();
  });

  describe('analyzePdf', () => {
    it('analyzes a valid single-page PDF', async () => {
      const blob = await createTestPdf(1, { withText: true, pageWidth: 600, pageHeight: 800 });
      const meta = await analyzePdf(blob);

      expect(meta.pageCount).toBe(1);
      expect(meta.originalBytes).toBeGreaterThan(0);
      expect(meta.pageDimensions).toHaveLength(1);
      expect(meta.pageDimensions[0].width).toBe(600);
      expect(meta.pageDimensions[0].height).toBe(800);
      expect(meta.isEncrypted).toBe(false);
      expect(meta.hasSelectableText).toBe(true);
    });

    it('analyzes a multi-page PDF accurately', async () => {
      const blob = await createTestPdf(5, { withText: false });
      const meta = await analyzePdf(blob);

      expect(meta.pageCount).toBe(5);
      expect(meta.pageDimensions).toHaveLength(5);
      expect(meta.isImageHeavy).toBe(true);
    });

    it('rejects corrupt/invalid PDF files gracefully', async () => {
      const corruptBlob = new Blob(['Not a real PDF header or content'], { type: 'application/pdf' });
      await expect(analyzePdf(corruptBlob)).rejects.toThrow(
        'This PDF could not be opened. Your original file is unchanged.'
      );
    });

    it('rejects documents with excessive page counts to protect browser memory', async () => {
      const hugeBlob = await createTestPdf(105);
      await expect(analyzePdf(hugeBlob)).rejects.toThrow(
        /This PDF has too many pages/
      );
    });
  });

  describe('validatePdfOutput', () => {
    it('validates a valid generated PDF successfully', async () => {
      const blob = await createTestPdf(3);
      const isValid = await validatePdfOutput(blob, 3);
      expect(isValid).toBe(true);
    });

    it('fails validation when page count does not match expected count', async () => {
      const blob = await createTestPdf(2);
      await expect(validatePdfOutput(blob, 5)).rejects.toThrow(/Page count mismatch/);
    });

    it('fails validation for empty or corrupt blobs', async () => {
      const emptyBlob = new Blob([], { type: 'application/pdf' });
      await expect(validatePdfOutput(emptyBlob, 1)).rejects.toThrow(/Empty output blob/);
    });
  });

  describe('compressPdf', () => {
    it('returns original unchanged if already below target size (Section 25)', async () => {
      const blob = await createTestPdf(1, { withText: true });
      const targetBytes = blob.size + 10000; // Target is higher than original

      const result = await compressPdf({
        file: blob,
        targetBytes,
      });

      expect(result.mode).toBe('original-unchanged');
      expect(result.achievedTarget).toBe(true);
      expect(result.outputBytes).toBe(blob.size);
      expect(result.statusMessage).toContain('already below your target size');
    });

    it('achieves target with Mode A structure-preserving optimization when applicable', async () => {
      // Create a PDF with selectable text
      const blob = await createTestPdf(2, { withText: true });
      // Target is achievable with pdf-lib object stream optimization
      const targetBytes = Math.round(blob.size * 1.5);

      const result = await compressPdf({
        file: blob,
        targetBytes,
      });

      expect(result.achievedTarget).toBe(true);
      expect(result.pageCount).toBe(2);
      expect(result.mimeType).toBe('application/pdf');
    });

    it('uses Mode B rasterized compression for scanned or image-heavy PDFs', async () => {
      const blob = await createTestPdf(3, {
        withText: false,
        addDummyPaddingBytes: 50000,
      });
      // Target smaller than original
      const targetBytes = 15000;

      const progressStages: string[] = [];
      const result = await compressPdf({
        file: blob,
        targetBytes,
        forceRasterize: true,
        progressCallback: (stage) => progressStages.push(stage),
      });

      expect(result.mode).toBe('rasterized-images');
      expect(result.pageCount).toBe(3);
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.outputBytes).toBeGreaterThan(0);
      expect(progressStages.length).toBeGreaterThan(0);
    });

    it('preserves exact page count and dimensions in output', async () => {
      const blob = await createTestPdf(4, {
        pageWidth: 400,
        pageHeight: 600,
      });

      const result = await compressPdf({
        file: blob,
        targetBytes: 500000,
        forceRasterize: true,
      });

      expect(result.pageCount).toBe(4);

      // Verify reopened dimensions match source
      const meta = await analyzePdf(result.blob);
      expect(meta.pageCount).toBe(4);
      expect(meta.pageDimensions[0].width).toBe(400);
      expect(meta.pageDimensions[0].height).toBe(600);
    });

    it('stops at readability floor and alerts user when target is overly aggressive (Section 10)', async () => {
      const blob = await createTestPdf(5, {
        addDummyPaddingBytes: 100000,
      });

      // An impossibly small target (e.g. 100 bytes)
      const impossibleTarget = 100;

      const result = await compressPdf({
        file: blob,
        targetBytes: impossibleTarget,
        forceRasterize: true,
      });

      expect(result.achievedTarget).toBe(false);
      expect(result.isReadabilityFloorHit).toBe(true);
      expect(result.statusMessage).toContain('readability');
      expect(result.scale).toBeLessThanOrEqual(0.75);
      expect(result.quality).toBeLessThanOrEqual(0.38);
    });

    it('aborts cleanly and preserves original when a page fails to render', async () => {
      const blob = await createTestPdf(2);

      // Simulate render failure on a page
      const origGetContext = (globalThis.OffscreenCanvas as any).prototype.getContext;
      (globalThis.OffscreenCanvas as any).prototype.getContext = () => null;

      await expect(
        compressPdf({
          file: blob,
          targetBytes: 200,
          forceRasterize: true,
        })
      ).rejects.toThrow(/Failed to create canvas 2D rendering context/);

      (globalThis.OffscreenCanvas as any).prototype.getContext = origGetContext;
    });

    it('handles password-protected PDFs with user-friendly notice (Section 20 & 21)', async () => {
      // Simulate password protected exception
      const mockEncryptedBlob = new Blob(['%PDF-1.4 encrypted'], { type: 'application/pdf' });
      // When analyzed, if password protected error thrown:
      vi.spyOn(mockEncryptedBlob, 'arrayBuffer').mockRejectedValue({
        name: 'PasswordException',
        message: 'Password required',
      });

      await expect(
        compressPdf({
          file: mockEncryptedBlob,
          targetBytes: 50000,
        })
      ).rejects.toThrow(
        'This PDF is password protected and cannot be compressed automatically.'
      );
    });

    it('maximizes quality and scale under target ceiling rather than minimizing file size', async () => {
      const blob = await createTestPdf(1, {
        addDummyPaddingBytes: 50000,
      });

      // Target is 10,000 bytes (comfortable headroom for 1-page test PDF)
      const targetBytes = 10000;

      const result = await compressPdf({
        file: blob,
        targetBytes,
        forceRasterize: true,
      });

      expect(result.achievedTarget).toBe(true);
      expect(result.outputBytes).toBeLessThanOrEqual(targetBytes);
      // Ensure it maximized quality rather than dropping to floor (0.75 / 0.38)
      expect(result.scale).toBeGreaterThan(1.5);
      expect(result.quality).toBeGreaterThan(0.70);
    });

    it('scales quality proportionally with higher target budget ceilings', async () => {
      const blob = await createTestPdf(2, {
        addDummyPaddingBytes: 80000,
      });

      // Low target (tight budget)
      const tightResult = await compressPdf({
        file: blob,
        targetBytes: 3000,
        forceRasterize: true,
      });

      // High target (generous budget)
      const generousResult = await compressPdf({
        file: blob,
        targetBytes: 25000,
        forceRasterize: true,
      });

      expect(generousResult.outputBytes).toBeLessThanOrEqual(25000);
      expect(generousResult.scale!).toBeGreaterThanOrEqual(tightResult.scale!);
      expect(generousResult.quality!).toBeGreaterThanOrEqual(tightResult.quality!);
    });
  });
});

