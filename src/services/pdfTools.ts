import { PDFDocument, degrees } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { validatePdfOutput } from './pdfCompression';

// Initialize PDF.js worker in browser environment
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch {
    // Fallback if URL resolution fails
  }
}

export interface MergeSourceItem {
  id?: string;
  name: string;
  blob: Blob | Uint8Array;
  pageCount?: number;
}

export interface PdfToolResult {
  blob: Blob;
  pageCount: number;
  originalBytes: number;
  outputBytes: number;
  durationMs: number;
}

export interface PageConfig {
  originalIndex: number; // 0-based
  rotationDelta?: number; // 0, 90, 180, 270
}

export interface ImageToPdfItem {
  id?: string;
  name?: string;
  blob: Blob | Uint8Array;
}

export type PageOrientation = 'portrait' | 'landscape' | 'auto';
export type PageMargin = 'none' | 'small' | 'normal' | number;
export type ImageFitMode = 'fit' | 'fill';

export interface ImagesToPdfOptions {
  orientation?: PageOrientation;
  margin?: PageMargin;
  fit?: ImageFitMode;
  pageSize?: [number, number];
}

/**
 * Converts a Blob, File, or Uint8Array into a Uint8Array.
 */
async function toUint8Array(data: Blob | Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (typeof Blob !== 'undefined' && data instanceof Blob) {
    const buf = await data.arrayBuffer();
    return new Uint8Array(buf);
  }
  throw new Error('Unsupported PDF input data format.');
}

/**
 * Yields execution to keep the browser UI responsive.
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Merges multiple PDFs sequentially into a single PDF document.
 * Preserves page dimensions, orientations, and vector contents without rasterization.
 */
export async function mergePdfs(
  sources: MergeSourceItem[],
  progressCallback?: (stage: string, percent?: number) => void
): Promise<PdfToolResult> {
  const startTime = performance.now();

  if (!sources || sources.length < 2) {
    throw new Error('Please select at least 2 PDF documents to merge.');
  }

  progressCallback?.('Initializing PDF merge...', 5);
  await yieldToMain();

  const mergedDoc = await PDFDocument.create();
  let totalOriginalBytes = 0;
  let totalPagesMerged = 0;

  for (let i = 0; i < sources.length; i++) {
    const item = sources[i];
    const itemProgress = Math.round(10 + ((i + 1) / sources.length) * 75);
    progressCallback?.(`Merging file ${i + 1} of ${sources.length}: ${item.name}`, itemProgress);
    await yieldToMain();

    const bytes = await toUint8Array(item.blob);
    totalOriginalBytes += bytes.byteLength;

    let srcDoc: PDFDocument;
    try {
      srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    } catch (err: any) {
      throw new Error(`Failed to load "${item.name}". The file may be password-protected or corrupted.`);
    }

    const pageCount = srcDoc.getPageCount();
    if (pageCount === 0) {
      continue;
    }

    const allIndices = Array.from({ length: pageCount }, (_, idx) => idx);
    const copiedPages = await mergedDoc.copyPages(srcDoc, allIndices);

    for (const page of copiedPages) {
      mergedDoc.addPage(page);
      totalPagesMerged++;
    }

    // Release srcDoc reference for garbage collection
    (srcDoc as any) = null;
  }

  if (totalPagesMerged === 0) {
    throw new Error('No valid pages found in the selected PDF files to merge.');
  }

  progressCallback?.('Saving merged document...', 90);
  await yieldToMain();

  const outBytes = await mergedDoc.save();
  const outputBlob = new Blob([outBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  progressCallback?.('Validating merged PDF...', 95);
  await yieldToMain();

  await validatePdfOutput(outputBlob, totalPagesMerged);

  const durationMs = Math.round(performance.now() - startTime);
  progressCallback?.('Merge completed successfully', 100);

  return {
    blob: outputBlob,
    pageCount: totalPagesMerged,
    originalBytes: totalOriginalBytes,
    outputBytes: outputBlob.size,
    durationMs,
  };
}

/**
 * Unified page manipulator for a single PDF.
 * Applies reordering, page selection (extract/delete), and rotation in one clean pass.
 */
export async function modifyPdfPages(
  pdfData: Blob | Uint8Array,
  pageConfigs: PageConfig[],
  progressCallback?: (stage: string, percent?: number) => void
): Promise<PdfToolResult> {
  const startTime = performance.now();

  if (!pageConfigs || pageConfigs.length === 0) {
    throw new Error('Cannot produce an empty PDF. At least one page must remain.');
  }

  progressCallback?.('Loading PDF for page modifications...', 10);
  await yieldToMain();

  const bytes = await toUint8Array(pdfData);
  const originalBytes = bytes.byteLength;

  let srcDoc: PDFDocument;
  try {
    srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch (err: any) {
    throw new Error('Could not open this PDF. It may be password-protected or corrupted.');
  }

  const srcPageCount = srcDoc.getPageCount();

  // Validate all indices are within bounds
  for (const cfg of pageConfigs) {
    if (cfg.originalIndex < 0 || cfg.originalIndex >= srcPageCount) {
      throw new Error(`Invalid page index: ${cfg.originalIndex + 1} (PDF has ${srcPageCount} pages).`);
    }
  }

  progressCallback?.('Processing and copying pages...', 40);
  await yieldToMain();

  const outDoc = await PDFDocument.create();

  // Copy pages in the specified order
  const indicesToCopy = pageConfigs.map((cfg) => cfg.originalIndex);
  const copiedPages = await outDoc.copyPages(srcDoc, indicesToCopy);

  for (let i = 0; i < copiedPages.length; i++) {
    const page = copiedPages[i];
    const cfg = pageConfigs[i];

    if (cfg.rotationDelta && cfg.rotationDelta % 360 !== 0) {
      const currentAngle = page.getRotation().angle;
      const newAngle = ((currentAngle + cfg.rotationDelta) % 360 + 360) % 360;
      page.setRotation(degrees(newAngle));
    }

    outDoc.addPage(page);
  }

  progressCallback?.('Generating output PDF...', 85);
  await yieldToMain();

  const outBytes = await outDoc.save();
  const outputBlob = new Blob([outBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  progressCallback?.('Validating modified PDF...', 95);
  await yieldToMain();

  await validatePdfOutput(outputBlob, copiedPages.length);

  const durationMs = Math.round(performance.now() - startTime);
  progressCallback?.('Pages modified successfully', 100);

  return {
    blob: outputBlob,
    pageCount: copiedPages.length,
    originalBytes,
    outputBytes: outputBlob.size,
    durationMs,
  };
}

/**
 * Deletes selected pages from a PDF.
 * Never allows deleting all pages.
 */
export async function deletePages(
  pdfData: Blob | Uint8Array,
  pageIndicesToDelete: number[], // 0-based
  progressCallback?: (stage: string, percent?: number) => void
): Promise<PdfToolResult> {
  const bytes = await toUint8Array(pdfData);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  const deleteSet = new Set(pageIndicesToDelete);
  const pagesToKeep: PageConfig[] = [];

  for (let i = 0; i < totalPages; i++) {
    if (!deleteSet.has(i)) {
      pagesToKeep.push({ originalIndex: i });
    }
  }

  if (pagesToKeep.length === 0) {
    throw new Error('Cannot delete all pages. A PDF must have at least one page.');
  }

  return modifyPdfPages(bytes, pagesToKeep, progressCallback);
}

/**
 * Extracts selected pages from a PDF into a new PDF document.
 */
export async function extractPages(
  pdfData: Blob | Uint8Array,
  pageIndicesToExtract: number[], // 0-based
  progressCallback?: (stage: string, percent?: number) => void
): Promise<PdfToolResult> {
  if (!pageIndicesToExtract || pageIndicesToExtract.length === 0) {
    throw new Error('Please select at least one page to extract.');
  }

  const configs: PageConfig[] = pageIndicesToExtract.map((idx) => ({
    originalIndex: idx,
  }));

  return modifyPdfPages(pdfData, configs, progressCallback);
}

/**
 * Rotates specific pages of a PDF by a given delta in degrees (90, 180, 270).
 */
export async function rotatePages(
  pdfData: Blob | Uint8Array,
  rotations: Record<number, number> | Map<number, number>, // 0-based index -> rotation delta degrees
  progressCallback?: (stage: string, percent?: number) => void
): Promise<PdfToolResult> {
  const bytes = await toUint8Array(pdfData);
  const srcDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = srcDoc.getPageCount();

  const configs: PageConfig[] = [];

  for (let i = 0; i < totalPages; i++) {
    const delta =
      rotations instanceof Map ? rotations.get(i) || 0 : (rotations as Record<number, number>)[i] || 0;
    configs.push({
      originalIndex: i,
      rotationDelta: delta,
    });
  }

  return modifyPdfPages(bytes, configs, progressCallback);
}

/**
 * Reorders pages of a PDF according to the specified array of 0-based indices.
 */
export async function reorderPages(
  pdfData: Blob | Uint8Array,
  newOrderIndices: number[], // 0-based
  progressCallback?: (stage: string, percent?: number) => void
): Promise<PdfToolResult> {
  if (!newOrderIndices || newOrderIndices.length === 0) {
    throw new Error('Reorder indices cannot be empty.');
  }

  const configs: PageConfig[] = newOrderIndices.map((idx) => ({
    originalIndex: idx,
  }));

  return modifyPdfPages(pdfData, configs, progressCallback);
}

/**
 * Parses a 1-based page range string (e.g. "1-3, 5", "2, 4-6", "1") into a sorted,
 * deduplicated array of 0-based page indices.
 *
 * Throws an Error if syntax is invalid or any page number is out of the range [1, totalPages].
 */
export function parsePageRanges(rangeStr: string, totalPages: number): number[] {
  if (!rangeStr || !rangeStr.trim()) {
    return [];
  }

  const parts = rangeStr.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return [];
  }

  const indices = new Set<number>();

  for (const part of parts) {
    if (part.includes('-')) {
      const bounds = part.split('-').map((b) => b.trim());
      if (bounds.length !== 2) {
        throw new Error(`Invalid range format: "${part}". Expected format like "1-3".`);
      }
      const start = parseInt(bounds[0], 10);
      const end = parseInt(bounds[1], 10);
      if (isNaN(start) || isNaN(end)) {
        throw new Error(`Invalid range numbers in "${part}".`);
      }
      if (start > end) {
        throw new Error(`Range start (${start}) cannot be greater than range end (${end}) in "${part}".`);
      }
      if (start < 1 || end > totalPages) {
        throw new Error(
          `Page range "${part}" is out of bounds. Document has ${totalPages} page${totalPages === 1 ? '' : 's'} (valid: 1-${totalPages}).`
        );
      }
      for (let p = start; p <= end; p++) {
        indices.add(p - 1);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (isNaN(pageNum)) {
        throw new Error(`Invalid page number: "${part}".`);
      }
      if (pageNum < 1 || pageNum > totalPages) {
        throw new Error(
          `Page ${pageNum} is out of bounds. Document has ${totalPages} page${totalPages === 1 ? '' : 's'} (valid: 1-${totalPages}).`
        );
      }
      indices.add(pageNum - 1);
    }
  }

  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Converts image data to JPEG Uint8Array via browser Canvas when direct embedding isn't supported.
 */
async function convertImageToJpegBytes(data: Blob | Uint8Array): Promise<Uint8Array> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return data instanceof Uint8Array ? data : new Uint8Array(await data.arrayBuffer());
  }

  const blob = data instanceof Blob ? data : new Blob([data.buffer as ArrayBuffer]);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<Uint8Array>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D context not available'));
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(
            async (b) => {
              if (!b) {
                reject(new Error('Failed to convert image on canvas'));
                return;
              }
              const buf = await b.arrayBuffer();
              resolve(new Uint8Array(buf));
            },
            'image/jpeg',
            0.92
          );
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Failed to load image for conversion'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Converts multiple image files into a single combined PDF document.
 * Supports configurable orientation (portrait, landscape, auto), margins, and image fit.
 */
export async function imagesToPdf(
  images: ImageToPdfItem[],
  options?: ImagesToPdfOptions,
  progressCallback?: (stage: string, percent?: number) => void
): Promise<PdfToolResult> {
  const startTime = performance.now();

  if (!images || images.length === 0) {
    throw new Error('Please select at least one image to convert to PDF.');
  }

  progressCallback?.('Initializing PDF document...', 5);
  await yieldToMain();

  const pdfDoc = await PDFDocument.create();
  let totalInputBytes = 0;

  const defaultPageSize: [number, number] = options?.pageSize || [595.28, 841.89]; // A4 points
  const orientation = options?.orientation || 'auto';
  const fitMode = options?.fit || 'fit';

  let marginPt = 36; // normal: 0.5 in / 36 points
  if (options?.margin === 'none') {
    marginPt = 0;
  } else if (options?.margin === 'small') {
    marginPt = 20;
  } else if (typeof options?.margin === 'number') {
    marginPt = Math.max(0, options.margin);
  }

  for (let i = 0; i < images.length; i++) {
    const item = images[i];
    const pct = Math.round(10 + ((i + 1) / images.length) * 75);
    progressCallback?.(`Embedding image ${i + 1} of ${images.length}: ${item.name || `Image ${i + 1}`}`, pct);
    await yieldToMain();

    const bytes = await toUint8Array(item.blob);
    totalInputBytes += bytes.byteLength;

    let embeddedImage;
    const isPng =
      bytes.length > 4 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    const isJpg =
      bytes.length > 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;

    if (isPng) {
      try {
        embeddedImage = await pdfDoc.embedPng(bytes);
      } catch {
        // Fallback below
      }
    } else if (isJpg) {
      try {
        embeddedImage = await pdfDoc.embedJpg(bytes);
      } catch {
        // Fallback below
      }
    }

    if (!embeddedImage) {
      if (typeof document !== 'undefined') {
        const convertedJpgBytes = await convertImageToJpegBytes(item.blob);
        embeddedImage = await pdfDoc.embedJpg(convertedJpgBytes);
      } else {
        try {
          embeddedImage = await pdfDoc.embedJpg(bytes);
        } catch {
          embeddedImage = await pdfDoc.embedPng(bytes);
        }
      }
    }

    const imgWidth = embeddedImage.width;
    const imgHeight = embeddedImage.height;

    // Determine page dimensions
    let pageWidth: number;
    let pageHeight: number;

    const baseShort = Math.min(defaultPageSize[0], defaultPageSize[1]);
    const baseLong = Math.max(defaultPageSize[0], defaultPageSize[1]);

    if (orientation === 'landscape') {
      pageWidth = baseLong;
      pageHeight = baseShort;
    } else if (orientation === 'portrait') {
      pageWidth = baseShort;
      pageHeight = baseLong;
    } else {
      // auto: adapt to image aspect ratio
      if (imgWidth > imgHeight) {
        pageWidth = baseLong;
        pageHeight = baseShort;
      } else {
        pageWidth = baseShort;
        pageHeight = baseLong;
      }
    }

    const availWidth = Math.max(10, pageWidth - 2 * marginPt);
    const availHeight = Math.max(10, pageHeight - 2 * marginPt);

    let drawWidth: number;
    let drawHeight: number;
    let drawX: number;
    let drawY: number;

    if (fitMode === 'fill') {
      drawWidth = availWidth;
      drawHeight = availHeight;
      drawX = marginPt;
      drawY = marginPt;
    } else {
      // fit: preserve aspect ratio
      const scale = Math.min(availWidth / imgWidth, availHeight / imgHeight);
      drawWidth = imgWidth * scale;
      drawHeight = imgHeight * scale;
      drawX = marginPt + (availWidth - drawWidth) / 2;
      drawY = marginPt + (availHeight - drawHeight) / 2;
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    page.drawImage(embeddedImage, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight,
    });
  }

  progressCallback?.('Saving PDF document...', 90);
  await yieldToMain();

  const outBytes = await pdfDoc.save();
  const outputBlob = new Blob([outBytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  progressCallback?.('Validating PDF output...', 95);
  await yieldToMain();

  await validatePdfOutput(outputBlob, images.length);

  const durationMs = Math.round(performance.now() - startTime);
  progressCallback?.('Conversion completed successfully', 100);

  return {
    blob: outputBlob,
    pageCount: images.length,
    originalBytes: totalInputBytes,
    outputBytes: outputBlob.size,
    durationMs,
  };
}

