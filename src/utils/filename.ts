/**
 * Utilities for formatting target labels and generating output filenames.
 */

export function formatTargetLabel(bytes: number): string {
  if (bytes <= 0 || isNaN(bytes)) return 'Custom';
  const mb = bytes / (1024 * 1024);
  const kb = bytes / 1024;

  if (Number.isInteger(mb)) {
    return `${mb}MB`;
  }
  if (mb >= 1 && Math.round(mb * 10) % 5 === 0) {
    return `${mb}MB`;
  }
  if (Number.isInteger(kb)) {
    return `${kb}KB`;
  }
  if (mb >= 1) {
    return `${mb.toFixed(1)}MB`;
  }
  return `${Math.round(kb)}KB`;
}

export function getExtensionForMimeType(mimeType: string, defaultExt: string = 'jpg'): string {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return defaultExt;
  }
}

/**
 * Generates an informative output filename adhering to:
 * {OriginalBase}_{TargetLabel}.{ext}
 * E.g., "photo.jpg" (target 500 KB) -> "photo_500KB.jpg"
 * "document.final.v2.jpg" (target 1 MB) -> "document.final.v2_1MB.jpg"
 * "scan.png" (converted to webp) -> "scan_500KB.webp"
 */
export function generateOutputFilename(
  originalName: string,
  targetBytes: number,
  outputMimeType?: string
): string {
  if (!originalName) return `output_${formatTargetLabel(targetBytes)}.jpg`;

  // Find last dot for extension
  const lastDotIdx = originalName.lastIndexOf('.');
  const baseName = lastDotIdx > 0 ? originalName.slice(0, lastDotIdx) : originalName;
  const originalExt = lastDotIdx > 0 ? originalName.slice(lastDotIdx + 1).toLowerCase() : 'jpg';

  const targetLabel = formatTargetLabel(targetBytes);

  let finalExt = originalExt === 'jpeg' ? 'jpg' : originalExt;
  if (outputMimeType) {
    finalExt = getExtensionForMimeType(outputMimeType, finalExt);
  }

  return `${baseName}_${targetLabel}.${finalExt}`;
}
