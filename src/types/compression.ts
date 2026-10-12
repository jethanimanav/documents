export interface ImageCompressionOptions {
  file: Blob | File;
  targetBytes: number;
  maxDimension?: number;
  minQuality?: number;
  maxQuality?: number;
  allowWebpConversion?: boolean;
  progressCallback?: (stage: string, percent?: number) => void;
}

export interface ImageCompressionResult {
  blob: Blob;
  originalBytes: number;
  outputBytes: number;
  mimeType: string;
  width: number;
  height: number;
  quality: number;
  scale: number;
  achievedTarget: boolean;
  iterations: number;
  formatConverted: boolean;
  reductionPercentage: number;
  statusMessage?: string;
}

export interface BatchImageItem {
  id?: string;
  name: string;
  file: Blob;
}

export interface BatchItemResult {
  name: string;
  success: boolean;
  result?: ImageCompressionResult;
  error?: string;
  suggestedFilename: string;
}

export interface BatchCompressionProgress {
  currentIndex: number;
  totalFiles: number;
  currentFilename: string;
  currentFilePercent: number;
  overallPercent: number;
  stage: string;
}

export interface TargetSizePreset {
  id: string;
  label: string;
  bytes: number;
}

export const DEFAULT_IMAGE_PRESETS: TargetSizePreset[] = [
  { id: '100kb', label: '100 KB', bytes: 100 * 1024 },
  { id: '200kb', label: '200 KB', bytes: 200 * 1024 },
  { id: '500kb', label: '500 KB', bytes: 500 * 1024 },
  { id: '1mb', label: '1 MB', bytes: 1024 * 1024 },
  { id: '2mb', label: '2 MB', bytes: 2 * 1024 * 1024 },
];

export const DEFAULT_PDF_PRESETS: TargetSizePreset[] = [
  { id: '100kb', label: '100 KB', bytes: 100 * 1024 },
  { id: '200kb', label: '200 KB', bytes: 200 * 1024 },
  { id: '500kb', label: '500 KB', bytes: 500 * 1024 },
  { id: '1mb', label: '1 MB', bytes: 1024 * 1024 },
  { id: '2mb', label: '2 MB', bytes: 2 * 1024 * 1024 },
  { id: '5mb', label: '5 MB', bytes: 5 * 1024 * 1024 },
];

export type PdfProcessingMode = 'optimized-structure' | 'rasterized-images' | 'original-unchanged';

export interface PdfMetadata {
  pageCount: number;
  originalBytes: number;
  pageDimensions: Array<{ width: number; height: number }>;
  isEncrypted: boolean;
  isImageHeavy: boolean;
  hasSelectableText: boolean;
}

export interface PdfCompressionOptions {
  file: Blob | File;
  targetBytes: number;
  forceRasterize?: boolean;
  progressCallback?: (stage: string, percent?: number) => void;
}

export interface PdfCompressionResult {
  blob: Blob;
  originalBytes: number;
  outputBytes: number;
  mimeType: 'application/pdf';
  pageCount: number;
  mode: PdfProcessingMode;
  achievedTarget: boolean;
  reductionPercentage: number;
  scale?: number;
  quality?: number;
  statusMessage?: string;
  isReadabilityFloorHit?: boolean;
}

