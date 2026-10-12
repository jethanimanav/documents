import { describe, it, expect, beforeEach, vi } from 'vitest';
import { compressImage } from '../imageCompression';

// Polyfill/mock image decoding and canvas for Node/Vitest environment
class MockImageBitmap {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  close() {}
}

class MockOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      imageSmoothingEnabled: true,
      imageSmoothingQuality: 'high',
    };
  }

  async convertToBlob({ type, quality }: { type: string; quality: number }): Promise<Blob> {
    // Deterministic size calculation based on dimensions, format, and quality:
    // Raw pixels = width * height.
    // Base compression factor:
    // JPEG/WebP: bytes ~ (width * height * 0.25 * quality)
    // Quality ranges from 0.3 to 0.95
    const baseFactor = type === 'image/webp' ? 0.22 : 0.28;
    const estimatedBytes = Math.max(
      150,
      Math.round(this.width * this.height * baseFactor * quality)
    );
    return new Blob([new Uint8Array(estimatedBytes)], { type });
  }
}

describe('Image Compression Engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Setup global OffscreenCanvas mock
    globalThis.OffscreenCanvas = MockOffscreenCanvas as any;

    // Setup global createImageBitmap mock
    globalThis.createImageBitmap = vi.fn().mockImplementation(async (blob: Blob) => {
      // Extract simulated dimensions if specified in blob or default to 2000x1500
      const size = blob.size;
      if (size > 10_000_000) {
        // Very large image
        return new MockImageBitmap(5000, 4000); // 20M pixels
      }
      return new MockImageBitmap(2000, 1500); // 3M pixels
    });
  });

  describe('JPEG Compression', () => {
    it('compresses a 2.5 MB JPEG down to target 500 KB', async () => {
      const originalBytes = 2.5 * 1024 * 1024;
      const fakeJpeg = new Blob([new Uint8Array(originalBytes)], { type: 'image/jpeg' });

      const result = await compressImage({
        file: fakeJpeg,
        targetBytes: 500 * 1024,
      });

      expect(result.achievedTarget).toBe(true);
      expect(result.outputBytes).toBeLessThanOrEqual(500 * 1024);
      expect(result.originalBytes).toBe(originalBytes);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.reductionPercentage).toBeGreaterThan(0);
      expect(result.iterations).toBeGreaterThan(0);
    });
  });

  describe('PNG Processing & WebP Conversion', () => {
    it('converts PNG to WebP to preserve transparency and achieve target size', async () => {
      const originalBytes = 1.8 * 1024 * 1024;
      const fakePng = new Blob([new Uint8Array(originalBytes)], { type: 'image/png' });

      const result = await compressImage({
        file: fakePng,
        targetBytes: 400 * 1024,
        allowWebpConversion: true,
      });

      expect(result.achievedTarget).toBe(true);
      expect(result.outputBytes).toBeLessThanOrEqual(400 * 1024);
      expect(result.mimeType).toBe('image/webp');
      expect(result.formatConverted).toBe(true);
    });
  });

  describe('WebP Compression', () => {
    it('compresses WebP image directly preserving webp format', async () => {
      const originalBytes = 1.2 * 1024 * 1024;
      const fakeWebp = new Blob([new Uint8Array(originalBytes)], { type: 'image/webp' });

      const result = await compressImage({
        file: fakeWebp,
        targetBytes: 200 * 1024,
      });

      expect(result.achievedTarget).toBe(true);
      expect(result.outputBytes).toBeLessThanOrEqual(200 * 1024);
      expect(result.mimeType).toBe('image/webp');
      expect(result.formatConverted).toBe(false);
    });
  });

  describe('Preset Target Sizes', () => {
    const originalBytes = 3 * 1024 * 1024;
    const testImage = new Blob([new Uint8Array(originalBytes)], { type: 'image/jpeg' });

    it('compresses to 100 KB target', async () => {
      const result = await compressImage({ file: testImage, targetBytes: 100 * 1024 });
      expect(result.outputBytes).toBeLessThanOrEqual(100 * 1024);
    });

    it('compresses to 200 KB target', async () => {
      const result = await compressImage({ file: testImage, targetBytes: 200 * 1024 });
      expect(result.outputBytes).toBeLessThanOrEqual(200 * 1024);
    });

    it('compresses to 500 KB target', async () => {
      const result = await compressImage({ file: testImage, targetBytes: 500 * 1024 });
      expect(result.outputBytes).toBeLessThanOrEqual(500 * 1024);
    });

    it('compresses to 1 MB target', async () => {
      const result = await compressImage({ file: testImage, targetBytes: 1024 * 1024 });
      expect(result.outputBytes).toBeLessThanOrEqual(1024 * 1024);
    });
  });

  describe('Edge Cases', () => {
    it('shortcuts immediately when original is already smaller than or equal to target', async () => {
      const smallImage = new Blob([new Uint8Array(150 * 1024)], { type: 'image/jpeg' });

      const result = await compressImage({
        file: smallImage,
        targetBytes: 500 * 1024,
      });

      expect(result.achievedTarget).toBe(true);
      expect(result.outputBytes).toBe(150 * 1024);
      expect(result.iterations).toBe(0); // No encoding work done!
      expect(result.statusMessage).toContain('already smaller');
    });

    it('safely caps dimensions for extremely large images (> 12M pixels)', async () => {
      // 5000x4000 = 20M pixels (> 12M safe cap)
      const hugeImage = new Blob([new Uint8Array(12 * 1024 * 1024)], { type: 'image/jpeg' });

      const result = await compressImage({
        file: hugeImage,
        targetBytes: 500 * 1024,
      });

      // Dimension should be scaled down safely to fit within ~12M pixels
      expect(result.width * result.height).toBeLessThanOrEqual(12_000_000);
      expect(result.achievedTarget).toBe(true);
    });

    it('handles impossible tiny target gracefully by returning best achievable result', async () => {
      const normalImage = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: 'image/jpeg' });

      // Target of only 500 bytes is impossible for 2000x1500 image with readability floor
      const result = await compressImage({
        file: normalImage,
        targetBytes: 500, // 500 bytes
      });

      expect(result.achievedTarget).toBe(false);
      expect(result.statusMessage).toContain('Target could not be reached');
      expect(result.blob).toBeDefined();
    });

    it('throws error for invalid or empty input Blob', async () => {
      await expect(
        compressImage({
          file: null as any,
          targetBytes: 500 * 1024,
        })
      ).rejects.toThrow('Invalid image data');

      const emptyBlob = new Blob([], { type: 'image/jpeg' });
      await expect(
        compressImage({
          file: emptyBlob,
          targetBytes: 500 * 1024,
        })
      ).rejects.toThrow('empty');
    });

    it('throws error for zero or negative target size', async () => {
      const image = new Blob([new Uint8Array(1000)], { type: 'image/jpeg' });

      await expect(compressImage({ file: image, targetBytes: 0 })).rejects.toThrow(
        'Invalid target size'
      );
      await expect(compressImage({ file: image, targetBytes: -500 })).rejects.toThrow(
        'Invalid target size'
      );
    });

    it('throws error for unsupported MIME types', async () => {
      const pdfBlob = new Blob([new Uint8Array(1000)], { type: 'application/pdf' });
      await expect(
        compressImage({ file: pdfBlob, targetBytes: 500 * 1024 })
      ).rejects.toThrow("This file type isn't supported for image compression yet");

      const txtBlob = new Blob([new Uint8Array(1000)], { type: 'text/plain' });
      await expect(
        compressImage({ file: txtBlob, targetBytes: 500 * 1024 })
      ).rejects.toThrow("This file type isn't supported for image compression yet");
    });
  });

  describe('Candidate Quality Maximization Under Target Budget (Milestone 2)', () => {
    it('chooses the higher-quality valid candidate over a smaller candidate when both satisfy target', async () => {
      // 2000x1500 image with 3MB original
      const originalImage = new Blob([new Uint8Array(3 * 1024 * 1024)], { type: 'image/jpeg' });
      const targetBytes = 500 * 1024; // 500 KB target

      const result = await compressImage({
        file: originalImage,
        targetBytes,
      });

      expect(result.achievedTarget).toBe(true);
      expect(result.outputBytes).toBeLessThanOrEqual(targetBytes);
      // Quality should not be minimized down to the 0.3 floor if higher quality fits
      expect(result.quality).toBeGreaterThanOrEqual(0.5);
      // Width should be preserved safely rather than drastically shrunken down to 200px floor
      expect(result.width).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('Batch Image Compression (Milestone 2)', () => {
    it('processes multiple images sequentially with progress tracking and safe filenames', async () => {
      const { batchCompressImages } = await import('../imageCompression');

      const items = [
        { name: 'Photo1.jpg', file: new Blob([new Uint8Array(1024 * 1024)], { type: 'image/jpeg' }) },
        { name: 'Photo2.png', file: new Blob([new Uint8Array(800 * 1024)], { type: 'image/png' }) },
        { name: 'Invalid.xyz', file: new Blob([new Uint8Array(500)], { type: 'application/unknown' }) },
      ];

      const progressSteps: any[] = [];
      const results = await batchCompressImages(
        items,
        { targetBytes: 300 * 1024 },
        (p) => progressSteps.push({ ...p })
      );

      expect(results).toHaveLength(3);

      // Item 1 succeeds
      expect(results[0].name).toBe('Photo1.jpg');
      expect(results[0].success).toBe(true);
      expect(results[0].result?.achievedTarget).toBe(true);
      expect(results[0].suggestedFilename).toBe('Photo1_300KB.jpg');

      // Item 2 succeeds and converts png -> webp
      expect(results[1].name).toBe('Photo2.png');
      expect(results[1].success).toBe(true);
      expect(results[1].suggestedFilename).toBe('Photo2_300KB.webp');

      // Item 3 fails gracefully without breaking the batch
      expect(results[2].name).toBe('Invalid.xyz');
      expect(results[2].success).toBe(false);
      expect(results[2].error).toBeDefined();

      // Progress checks
      expect(progressSteps.length).toBeGreaterThan(0);
      expect(progressSteps[progressSteps.length - 1].overallPercent).toBe(100);
    });
  });
});
