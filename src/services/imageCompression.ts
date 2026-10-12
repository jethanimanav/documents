import type {
  ImageCompressionOptions,
  ImageCompressionResult,
  BatchImageItem,
  BatchItemResult,
  BatchCompressionProgress,
} from '../types/compression';
import { generateOutputFilename } from '../utils/filename';

const MAX_SAFE_CANVAS_PIXELS = 12_000_000; // ~12M pixels, safe limit for mobile/iOS
const MIN_DIMENSION_FLOOR = 200; // Minimum width/height to maintain text readability
const DEFAULT_MIN_QUALITY = 0.3;
const DEFAULT_MAX_QUALITY = 0.92;
const MAX_TOTAL_ITERATIONS = 12;

interface DecodedImageSource {
  source: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
  close: () => void;
}

/**
 * Decodes an image Blob into an ImageBitmap or HTMLImageElement,
 * respecting EXIF orientation.
 */
async function decodeImage(blob: Blob): Promise<DecodedImageSource> {
  // 1. Try createImageBitmap with EXIF orientation
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close?.(),
      };
    } catch {
      // Fallback to Image element
    }
  }

  // 2. Fallback to HTMLImageElement
  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({
          source: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          close: () => {},
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Couldn't decode this image file. It may be corrupted or unsupported."));
      };
      img.src = objectUrl;
    });
  }

  throw new Error('Image decoding is not supported in this runtime environment.');
}

/**
 * Encodes a canvas to a Blob in a cross-environment manner.
 */
async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mimeType: string,
  quality: number
): Promise<Blob> {
  if ('convertToBlob' in canvas && typeof (canvas as OffscreenCanvas).convertToBlob === 'function') {
    return (canvas as OffscreenCanvas).convertToBlob({ type: mimeType, quality });
  }

  const htmlCanvas = canvas as HTMLCanvasElement;
  return new Promise<Blob>((resolve, reject) => {
    htmlCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas encoding failed to produce a valid image Blob.'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Primary client-side image compression engine.
 * - Binary searches quality ladder.
 * - Safely reduces dimensions when quality floor is reached.
 * - Preserves aspect ratio.
 * - Handles PNG transparency (converting to WebP with user visibility).
 * - Yields to main thread so UI never freezes.
 */
export async function compressImage(
  options: ImageCompressionOptions
): Promise<ImageCompressionResult> {
  const {
    file,
    targetBytes,
    maxDimension,
    minQuality = DEFAULT_MIN_QUALITY,
    maxQuality = DEFAULT_MAX_QUALITY,
    allowWebpConversion = true,
    progressCallback,
  } = options;

  // 1. Input Validation
  if (!file || !(file instanceof Blob)) {
    throw new Error('Invalid image data provided for compression.');
  }

  if (file.size === 0) {
    throw new Error('The provided image file is empty (0 bytes).');
  }

  if (!targetBytes || targetBytes <= 0 || isNaN(targetBytes)) {
    throw new Error('Invalid target size requested. Target size must be greater than 0 bytes.');
  }

  const inputMime = (file.type || '').toLowerCase();
  const isJpeg = inputMime.includes('jpeg') || inputMime.includes('jpg');
  const isPng = inputMime.includes('png');
  const isWebp = inputMime.includes('webp');

  if (!isJpeg && !isPng && !isWebp) {
    throw new Error("This file type isn't supported for image compression yet.");
  }

  progressCallback?.('Decoding image...', 10);
  const decoded = await decodeImage(file);

  try {
    const origWidth = decoded.width;
    const origHeight = decoded.height;
    const origSize = file.size;

    if (origWidth <= 0 || origHeight <= 0) {
      throw new Error('Invalid image dimensions detected.');
    }

    // 2. Shortcut: If already at or under target, return original unchanged
    if (origSize <= targetBytes) {
      return {
        blob: file,
        originalBytes: origSize,
        outputBytes: origSize,
        mimeType: file.type || 'image/jpeg',
        width: origWidth,
        height: origHeight,
        quality: 1.0,
        scale: 1.0,
        achievedTarget: true,
        iterations: 0,
        formatConverted: false,
        reductionPercentage: 0,
        statusMessage: 'Original image is already smaller than or equal to target size.',
      };
    }

    // 3. Determine output format
    let outputMime = 'image/jpeg';
    let formatConverted = false;

    if (isWebp) {
      outputMime = 'image/webp';
    } else if (isPng) {
      if (allowWebpConversion) {
        outputMime = 'image/webp';
        formatConverted = true;
      } else {
        outputMime = 'image/jpeg';
        formatConverted = true;
      }
    } else {
      outputMime = 'image/jpeg';
    }

    // 4. Initial Dimension Safety Capping
    let initialScale = 1.0;
    if (origWidth * origHeight > MAX_SAFE_CANVAS_PIXELS) {
      initialScale = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (origWidth * origHeight));
    }
    if (maxDimension && (origWidth > maxDimension || origHeight > maxDimension)) {
      const dimScale = maxDimension / Math.max(origWidth, origHeight);
      initialScale = Math.min(initialScale, dimScale);
    }

    let currentScale = initialScale;
    let iterations = 0;
    let bestValidCandidate: {
      blob: Blob;
      quality: number;
      width: number;
      height: number;
    } | null = null;
    let bestFallbackCandidate: {
      blob: Blob;
      quality: number;
      width: number;
      height: number;
    } | null = null;

    // 5. Search Loop (Dimension ladder crossed with binary-searched quality)
    while (iterations < MAX_TOTAL_ITERATIONS) {
      const currentWidth = Math.max(MIN_DIMENSION_FLOOR, Math.round(origWidth * currentScale));
      const currentHeight = Math.max(
        MIN_DIMENSION_FLOOR,
        Math.round(origHeight * currentScale)
      );

      progressCallback?.(
        `Rendering at ${currentWidth}×${currentHeight}px...`,
        Math.min(90, 20 + iterations * 8)
      );

      // Yield briefly to main thread to maintain UI responsiveness
      await new Promise((r) => setTimeout(r, 0));

      // Create canvas
      let canvas: HTMLCanvasElement | OffscreenCanvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        canvas = new OffscreenCanvas(currentWidth, currentHeight);
      } else if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
        canvas.width = currentWidth;
        canvas.height = currentHeight;
      } else {
        throw new Error('Canvas rendering is not supported in this runtime.');
      }

      const ctx = canvas.getContext('2d') as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D;

      if (!ctx) {
        throw new Error('Failed to create 2D canvas rendering context.');
      }

      // If encoding to JPEG, fill white background behind any transparency
      if (outputMime === 'image/jpeg') {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, currentWidth, currentHeight);
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(decoded.source, 0, 0, currentWidth, currentHeight);

      // Binary search quality at this dimension
      let qLow = minQuality;
      let qHigh = maxQuality;

      for (let qStep = 0; qStep < 4; qStep++) {
        iterations++;
        const testQuality = Number(((qLow + qHigh) / 2).toFixed(2));
        progressCallback?.(`Compressing quality ${Math.round(testQuality * 100)}%...`);

        const encoded = await canvasToBlob(canvas, outputMime, testQuality);

        if (encoded.size <= targetBytes) {
          // Output satisfies target: valid candidate
          if (!bestValidCandidate) {
            bestValidCandidate = {
              blob: encoded,
              quality: testQuality,
              width: currentWidth,
              height: currentHeight,
            };
          } else {
            // Quality score = total pixels * quality. Higher quality wins, never smaller solely for being smaller.
            const currScore = currentWidth * currentHeight * testQuality;
            const prevScore =
              bestValidCandidate.width *
              bestValidCandidate.height *
              bestValidCandidate.quality;
            if (
              currScore > prevScore ||
              (currScore === prevScore && encoded.size > bestValidCandidate.blob.size)
            ) {
              bestValidCandidate = {
                blob: encoded,
                quality: testQuality,
                width: currentWidth,
                height: currentHeight,
              };
            }
          }
          // Try higher quality at this dimension to maximize quality within target
          qLow = testQuality + 0.05;
        } else {
          // Too large, decrease quality
          qHigh = testQuality - 0.05;
          // Keep best fallback (closest to target without falling below floor)
          if (!bestFallbackCandidate || encoded.size < bestFallbackCandidate.blob.size) {
            bestFallbackCandidate = {
              blob: encoded,
              quality: testQuality,
              width: currentWidth,
              height: currentHeight,
            };
          }
        }

        if (qLow > qHigh) break;
      }

      // Free canvas resources immediately
      canvas.width = 0;
      canvas.height = 0;

      // If we found a valid candidate at this dimension (highest feasible resolution), stop search
      if (bestValidCandidate && bestValidCandidate.width === currentWidth) {
        break;
      }

      // If target still wasn't achieved at this dimension, check if we can downscale
      if (currentWidth <= MIN_DIMENSION_FLOOR || currentHeight <= MIN_DIMENSION_FLOOR) {
        // Readability floor reached; cannot downscale further
        break;
      }

      // Downscale dimensions by ~18% and try again
      currentScale *= 0.82;
    }

    const chosen = bestValidCandidate || bestFallbackCandidate;
    if (!chosen) {
      throw new Error("We couldn't prepare this image. Your original file is unchanged.");
    }

    const finalSize = chosen.blob.size;
    const achievedTarget = finalSize <= targetBytes;
    const reductionPercentage = Math.max(0, Math.round(((origSize - finalSize) / origSize) * 100));

    progressCallback?.('Finalizing...', 100);

    return {
      blob: chosen.blob,
      originalBytes: origSize,
      outputBytes: finalSize,
      mimeType: outputMime,
      width: chosen.width,
      height: chosen.height,
      quality: Math.round(chosen.quality * 100) / 100,
      scale: Math.round((chosen.width / origWidth) * 100) / 100,
      achievedTarget,
      iterations,
      formatConverted,
      reductionPercentage,
      statusMessage: achievedTarget
        ? 'Target achieved.'
        : 'Target could not be reached without excessive quality loss. Best achievable result provided.',
    };
  } finally {
    decoded.close();
  }
}

/**
 * Batches compression across multiple images sequentially to protect memory.
 * Preserves individual errors without terminating the entire batch.
 */
export async function batchCompressImages(
  items: BatchImageItem[],
  options: Omit<ImageCompressionOptions, 'file'>,
  onProgress?: (progress: BatchCompressionProgress) => void
): Promise<BatchItemResult[]> {
  if (!items || items.length === 0) {
    return [];
  }

  const results: BatchItemResult[] = [];
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    onProgress?.({
      currentIndex: i + 1,
      totalFiles: total,
      currentFilename: item.name,
      currentFilePercent: 0,
      overallPercent: Math.round((i / total) * 100),
      stage: `Starting ${item.name}...`,
    });

    try {
      const res = await compressImage({
        ...options,
        file: item.file,
        progressCallback: (stage, percent = 0) => {
          const overall = Math.round(((i + percent / 100) / total) * 100);
          onProgress?.({
            currentIndex: i + 1,
            totalFiles: total,
            currentFilename: item.name,
            currentFilePercent: percent,
            overallPercent: overall,
            stage,
          });
        },
      });

      const suggestedFilename = generateOutputFilename(
        item.name,
        options.targetBytes,
        res.mimeType
      );

      results.push({
        name: item.name,
        success: true,
        result: res,
        suggestedFilename,
      });
    } catch (err: any) {
      results.push({
        name: item.name,
        success: false,
        error: err?.message || 'Failed to compress image.',
        suggestedFilename: generateOutputFilename(item.name, options.targetBytes),
      });
    }

    onProgress?.({
      currentIndex: i + 1,
      totalFiles: total,
      currentFilename: item.name,
      currentFilePercent: 100,
      overallPercent: Math.round(((i + 1) / total) * 100),
      stage: `Finished ${item.name}`,
    });

    // Yield briefly to garbage collector and main thread between files
    await new Promise((r) => setTimeout(r, 10));
  }

  return results;
}
