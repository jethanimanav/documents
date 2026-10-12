import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { PDFDocument } from 'pdf-lib';
import type {
  PdfCompressionOptions,
  PdfCompressionResult,
  PdfMetadata,
} from '../types/compression';
import { formatFileSize } from '../utils/folder';

// Initialize PDF.js worker in browser environment
if (typeof window !== 'undefined' && pdfjsLib.GlobalWorkerOptions) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
  } catch {
    // Fallback if URL resolution fails
  }
}

const MAX_SAFE_PAGES = 100;
const READABILITY_MIN_SCALE = 0.75;
const READABILITY_MIN_QUALITY = 0.38;

/**
 * Normalizes error messages from PDF.js or pdf-lib into friendly, user-facing errors.
 */
function normalizePdfError(err: any): Error {
  const msg = err?.message || String(err || '');
  const name = err?.name || '';

  if (
    name === 'PasswordException' ||
    name === 'EncryptedPDFError' ||
    /password/i.test(msg) ||
    /encrypted/i.test(msg)
  ) {
    return new Error('This PDF is password protected and cannot be compressed automatically.');
  }

  if (/too many pages/i.test(msg)) {
    return new Error(msg);
  }

  return new Error(
    err?.isFriendly
      ? msg
      : 'This PDF could not be opened. Your original file is unchanged.'
  );
}

/**
 * Yields execution to keep the browser responsive and allow React to render progress.
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Analyzes a PDF file: page count, original size, page dimensions, text selectability.
 */
export async function analyzePdf(file: Blob | File): Promise<PdfMetadata> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);

    const loadingTask = pdfjsLib.getDocument({
      data: data.slice(),
    });

    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;

    if (pageCount > MAX_SAFE_PAGES) {
      throw new Error(
        `This PDF has too many pages (${pageCount} pages) to safely process in this browser. Maximum supported is ${MAX_SAFE_PAGES}.`
      );
    }

    const pageDimensions: Array<{ width: number; height: number }> = [];
    let sampleTextItemsCount = 0;
    const pagesToSample = Math.min(pageCount, 3);

    for (let p = 1; p <= pageCount; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1.0 });
      pageDimensions.push({
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      });

      if (p <= pagesToSample) {
        try {
          const textContent = await page.getTextContent();
          sampleTextItemsCount += textContent.items.length;
        } catch {
          // Text extraction optional
        }
      }
    }

    const hasSelectableText = sampleTextItemsCount > 0;
    const isImageHeavy = !hasSelectableText;

    return {
      pageCount,
      originalBytes: file.size,
      pageDimensions,
      isEncrypted: false,
      isImageHeavy,
      hasSelectableText,
    };
  } catch (err: any) {
    throw normalizePdfError(err);
  }
}

/**
 * Verifies that the generated PDF opens cleanly, has matching page count,
 * and every page can be retrieved without corrupt streams.
 */
export async function validatePdfOutput(
  blob: Blob,
  expectedPageCount: number
): Promise<boolean> {
  if (!blob || blob.size <= 0) {
    throw new Error('Output PDF validation failed: Empty output blob.');
  }

  if (blob.type !== 'application/pdf') {
    throw new Error(`Output validation failed: Invalid MIME type (${blob.type}).`);
  }

  const arrayBuffer = await blob.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);

  const loadingTask = pdfjsLib.getDocument({
    data: data.slice(),
  });

  const pdf = await loadingTask.promise;

  if (pdf.numPages !== expectedPageCount) {
    throw new Error(
      `Output validation failed: Page count mismatch (expected ${expectedPageCount}, got ${pdf.numPages}).`
    );
  }

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    if (!page) {
      throw new Error(`Output validation failed: Page ${i} is missing or corrupted.`);
    }
  }

  return true;
}

/**
 * Creates a canvas for rendering a page, with fallback to OffscreenCanvas or DOM canvas.
 */
function createPageCanvas(width: number, height: number): {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  toJpegBytes: (quality: number) => Promise<Uint8Array>;
} {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));

  let canvas: HTMLCanvasElement | OffscreenCanvas;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext('2d') as any;
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    ctx = canvas.getContext('2d');
  } else {
    throw new Error('Canvas rendering is not supported in this environment.');
  }

  if (!ctx) {
    throw new Error('Failed to create canvas 2D rendering context.');
  }

  const toJpegBytes = async (quality: number): Promise<Uint8Array> => {
    if ('convertToBlob' in canvas) {
      const blob = await (canvas as OffscreenCanvas).convertToBlob({
        type: 'image/jpeg',
        quality,
      });
      const buf = await blob.arrayBuffer();
      return new Uint8Array(buf);
    } else if ('toBlob' in canvas) {
      const htmlCanvas = canvas as HTMLCanvasElement;
      const blob = await new Promise<Blob | null>((resolve) =>
        htmlCanvas.toBlob(resolve, 'image/jpeg', quality)
      );
      if (!blob) throw new Error('Failed to convert canvas to JPEG.');
      const buf = await blob.arrayBuffer();
      return new Uint8Array(buf);
    } else {
      throw new Error('No supported canvas blob conversion available.');
    }
  };

  return { canvas, ctx, toJpegBytes };
}

/**
 * Primary PDF compression engine.
 * - Mode A: Structure-preserving optimization (retains selectable text, vectors, links).
 * - Mode B: Rasterized JPEG compression (used when target size requires it or for scanned PDFs).
 */
export async function compressPdf(
  options: PdfCompressionOptions
): Promise<PdfCompressionResult> {
  const { file, targetBytes, forceRasterize = false, progressCallback } = options;
  const originalBytes = file.size;

  progressCallback?.('Analyzing PDF document...', 5);
  await yieldToMain();

  let metadata: PdfMetadata;
  try {
    metadata = await analyzePdf(file);
  } catch (err: any) {
    throw normalizePdfError(err);
  }

  const { pageCount, hasSelectableText } = metadata;

  // 1. Performance check: If original is already under target, return original unchanged (Section 25)
  if (originalBytes <= targetBytes) {
    const rawBlob = file instanceof Blob ? file : new Blob([file], { type: 'application/pdf' });
    progressCallback?.('Original PDF is already below target size.', 100);
    return {
      blob: rawBlob,
      originalBytes,
      outputBytes: originalBytes,
      mimeType: 'application/pdf',
      pageCount,
      mode: 'original-unchanged',
      achievedTarget: true,
      reductionPercentage: 0,
      statusMessage: 'This PDF is already below your target size.',
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const rawData = new Uint8Array(arrayBuffer);

  // 2. Mode A — Attempt structure-preserving optimization first (Section 4 & 5)
  // If user did not force rasterize and document has selectable text:
  if (!forceRasterize) {
    progressCallback?.('Attempting structure-preserving optimization...', 15);
    await yieldToMain();

    try {
      const pdfDoc = await PDFDocument.load(rawData.slice(), { ignoreEncryption: false });
      const optimizedBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });

      if (optimizedBytes.byteLength <= targetBytes) {
        const optimizedBlob = new Blob([optimizedBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        progressCallback?.('Validating optimized PDF...', 90);
        await yieldToMain();

        await validatePdfOutput(optimizedBlob, pageCount);

        const reduction = Math.max(
          0,
          Math.round(((originalBytes - optimizedBytes.byteLength) / originalBytes) * 100)
        );

        progressCallback?.('PDF optimized successfully.', 100);
        return {
          blob: optimizedBlob,
          originalBytes,
          outputBytes: optimizedBytes.byteLength,
          mimeType: 'application/pdf',
          pageCount,
          mode: 'optimized-structure',
          achievedTarget: true,
          reductionPercentage: reduction,
          statusMessage: 'Optimized PDF structure while preserving selectable text and sharp graphics.',
        };
      }
    } catch (err: any) {
      if (/password|encrypted/i.test(err?.message || '')) {
        throw normalizePdfError(err);
      }
      // Non-fatal for Mode A; proceed to Mode B
      console.info('Mode A optimization insufficient for target; falling back to Mode B rasterization.');
    }
  }

  // 3. Mode B — Rasterized compression (Section 4 & 8)
  progressCallback?.(
    hasSelectableText
      ? 'Compressing pages to achieve target size (text will be rasterized)...'
      : 'Compressing scanned page images...',
    20
  );
  await yieldToMain();

  const loadingTask = pdfjsLib.getDocument({
    data: rawData.slice(),
  });
  const sourcePdf = await loadingTask.promise;

  // Quality parameter mapping: maps normalized quality t in [0, 1] to scale & quality
  function getQualityParams(t: number): { scale: number; quality: number } {
    const clampedT = Math.max(0, Math.min(1, t));
    const minScale = READABILITY_MIN_SCALE; // 0.75
    const minQuality = READABILITY_MIN_QUALITY; // 0.38
    const maxScale = pageCount > 5 ? 2.0 : pageCount > 2 ? 2.2 : 2.4;
    const maxQuality = pageCount > 5 ? 0.88 : 0.92;

    const scale = Math.round((minScale + (maxScale - minScale) * Math.pow(clampedT, 0.82)) * 100) / 100;
    const quality = Math.round((minQuality + (maxQuality - minQuality) * Math.pow(clampedT, 0.88)) * 100) / 100;

    return { scale, quality };
  }

  // Fast single-page probe helper to estimate document size response
  async function probePageJpegSize(pageNum: number, scale: number, quality: number): Promise<number> {
    const page = await sourcePdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    let { canvas, ctx, toJpegBytes } = createPageCanvas(viewport.width, viewport.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({
      canvas: canvas as any,
      canvasContext: ctx as any,
      viewport,
      intent: 'print',
    }).promise;
    const jpegBytes = await toJpegBytes(quality);
    canvas = null as any;
    ctx = null as any;
    return jpegBytes.byteLength;
  }

  // Helper to sequentially rasterize all pages and build the new PDF
  async function rasterizeAndBuildPdf(
    scale: number,
    quality: number,
    passNumber: number
  ): Promise<{ bytes: Uint8Array; pageCount: number }> {
    const newDoc = await PDFDocument.create();

    for (let p = 1; p <= pageCount; p++) {
      const pagePercent = Math.round(20 + (p / pageCount) * 65);
      progressCallback?.(
        `Rendering and compressing page ${p} of ${pageCount} (pass ${passNumber})...`,
        pagePercent
      );
      await yieldToMain();

      let page: any;
      try {
        page = await sourcePdf.getPage(p);
      } catch (err: any) {
        throw new Error(`Failed to load page ${p} from source PDF: ${err.message}`);
      }

      const viewport = page.getViewport({ scale });
      const origViewport = page.getViewport({ scale: 1.0 });

      let { canvas, ctx, toJpegBytes } = createPageCanvas(
        viewport.width,
        viewport.height
      );

      // Fill white background to guarantee transparent areas remain white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      try {
        await page.render({
          canvas: canvas as any,
          canvasContext: ctx,
          viewport,
          intent: 'print',
        }).promise;
      } catch (err: any) {
        throw new Error(`Failed to render page ${p}: ${err?.message || 'Rendering error'}`);
      }

      const jpegBytes = await toJpegBytes(quality);

      // Clean buffer offset for JpegEmbedder
      const cleanJpegBytes = new Uint8Array(
        jpegBytes.buffer.slice(
          jpegBytes.byteOffset,
          jpegBytes.byteOffset + jpegBytes.byteLength
        )
      );

      const embeddedImg = await newDoc.embedJpg(cleanJpegBytes);

      // Preserve original page dimensions and orientation in points
      const newPage = newDoc.addPage([origViewport.width, origViewport.height]);
      newPage.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: origViewport.width,
        height: origViewport.height,
      });

      // Release canvas reference explicitly for memory safety (Section 18)
      canvas = null as any;
      ctx = null as any;

      await yieldToMain();
    }

    progressCallback?.('Building and encoding output PDF...', 88);
    await yieldToMain();

    const bytes = await newDoc.save({ useObjectStreams: true });
    return { bytes, pageCount };
  }

  // 1. Probe Page 1 to estimate document size curve and set starting quality
  progressCallback?.('Calibrating optimal quality for target ceiling...', 22);
  await yieldToMain();

  const maxParams = getQualityParams(1.0);
  const minParams = getQualityParams(0.0);
  let initialT = 0.5;

  try {
    const maxPage1Size = await probePageJpegSize(1, maxParams.scale, maxParams.quality);
    const estimatedDocAtMax = maxPage1Size * pageCount + 2048 + pageCount * 400;

    if (estimatedDocAtMax <= targetBytes * 0.95) {
      // Maximum quality already fits under target ceiling!
      initialT = 1.0;
    } else {
      const minPage1Size = await probePageJpegSize(1, minParams.scale, minParams.quality);
      const estimatedDocAtMin = minPage1Size * pageCount + 2048 + pageCount * 400;

      if (estimatedDocAtMin > targetBytes) {
        // Even at readability floor, document is larger than target: start at floor
        initialT = 0.0;
      } else {
        // Interpolate target t aiming for ~95% of target budget ceiling
        const targetPageBudget = Math.max(
          1024,
          Math.floor((targetBytes * 0.95 - (2048 + pageCount * 400)) / pageCount)
        );
        const fraction = Math.max(
          0,
          Math.min(1, (targetPageBudget - minPage1Size) / Math.max(1, maxPage1Size - minPage1Size))
        );
        initialT = Math.round(fraction * 100) / 100;
      }
    }
  } catch (probeErr) {
    console.warn('Single page calibration note:', probeErr);
    initialT = 0.5;
  }

  // 2. Search Parameter Space: Maximize quality such that size <= targetBytes
  interface Candidate {
    bytes: Uint8Array;
    size: number;
    t: number;
    scale: number;
    quality: number;
  }

  let bestValidCandidate: Candidate | null = null;
  let lowestOvershootCandidate: Candidate | null = null;
  let currentT = initialT;
  const testedTValues = new Set<number>();

  const MAX_SEARCH_PASSES = 4;
  for (let pass = 1; pass <= MAX_SEARCH_PASSES; pass++) {
    const roundedT = Math.round(currentT * 100) / 100;
    if (testedTValues.has(roundedT)) {
      break;
    }
    testedTValues.add(roundedT);

    const { scale, quality } = getQualityParams(roundedT);
    const result = await rasterizeAndBuildPdf(scale, quality, pass);
    const measuredSize = result.bytes.byteLength;
    const candidate: Candidate = {
      bytes: result.bytes,
      size: measuredSize,
      t: roundedT,
      scale,
      quality,
    };

    if (measuredSize <= targetBytes) {
      // Valid candidate within ceiling budget
      if (
        !bestValidCandidate ||
        candidate.t > bestValidCandidate.t ||
        (candidate.t === bestValidCandidate.t && candidate.size > bestValidCandidate.size)
      ) {
        bestValidCandidate = candidate;
      }

      // If we are at >= 92% of targetBytes OR at t >= 0.95 (near max quality), we've found the optimal point
      if (measuredSize >= 0.92 * targetBytes || roundedT >= 0.95) {
        break;
      }

      // Significant headroom remaining! Step up t to increase quality toward target ceiling
      const headroomRatio = (targetBytes * 0.96) / measuredSize;
      const stepUp = (1.0 - roundedT) * Math.min(0.85, (headroomRatio - 1.0) * 0.65);
      currentT = Math.min(1.0, roundedT + Math.max(0.04, stepUp));
    } else {
      // Overshoot: size > targetBytes
      if (!lowestOvershootCandidate || candidate.size < lowestOvershootCandidate.size) {
        lowestOvershootCandidate = candidate;
      }

      if (roundedT <= 0.01) {
        // Already at readability floor and still overshot: stop search
        break;
      }

      // Step down t so next pass fits safely under target ceiling
      const overshootRatio = (targetBytes * 0.95) / measuredSize;
      const stepDown = roundedT * Math.pow(overshootRatio, 0.7);
      currentT = Math.max(0.0, Math.min(roundedT - 0.04, stepDown));
    }
  }

  let finalCandidate: Candidate;
  let isFloorHit = false;

  if (bestValidCandidate) {
    finalCandidate = bestValidCandidate;
  } else if (lowestOvershootCandidate) {
    finalCandidate = lowestOvershootCandidate;
    isFloorHit = true;
  } else {
    throw new Error("We couldn't prepare this PDF. Your original Google Drive file is unchanged.");
  }

  const outputBlob = new Blob([finalCandidate.bytes.buffer as ArrayBuffer], { type: 'application/pdf' });

  // 4. Validate output with PDF.js (Section 12)
  progressCallback?.('Validating prepared PDF...', 95);
  await yieldToMain();

  await validatePdfOutput(outputBlob, pageCount);

  const outputSize = outputBlob.size;
  const achievedTarget = outputSize <= targetBytes;
  const reductionPercentage = Math.max(
    0,
    Math.round(((originalBytes - outputSize) / originalBytes) * 100)
  );

  let statusMessage: string | undefined;
  if (!achievedTarget || isFloorHit) {
    statusMessage = `This target would significantly reduce readability. Best readable result: ${formatFileSize(outputSize)}.`;
  } else {
    statusMessage = `PDF optimized for maximum quality within ${formatFileSize(targetBytes)} upload limit.`;
  }

  progressCallback?.('Ready for upload', 100);

  return {
    blob: outputBlob,
    originalBytes,
    outputBytes: outputSize,
    mimeType: 'application/pdf',
    pageCount,
    mode: 'rasterized-images',
    achievedTarget,
    reductionPercentage,
    scale: finalCandidate.scale,
    quality: finalCandidate.quality,
    statusMessage,
    isReadabilityFloorHit: isFloorHit || !achievedTarget,
  };
}
