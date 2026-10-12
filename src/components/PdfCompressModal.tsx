import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Download,
  Share2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Shield,
  FileText,
  Layers,
  Check,
} from 'lucide-react';
import type { DocItem } from '../types';
import type {
  PdfCompressionResult,
  PdfMetadata,
} from '../types/compression';
import { DEFAULT_PDF_PRESETS } from '../types/compression';
import {
  analyzePdf,
  compressPdf,
} from '../services/pdfCompression';
import { driveFetch } from '../services/driveFetch';
import { formatFileSize } from '../utils/folder';
import { generateOutputFilename } from '../utils/filename';
import { useAuth } from '../hooks/useAuth';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

interface PdfCompressModalProps {
  doc: DocItem | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenManagePages?: () => void;
  onOpenMerge?: (doc: DocItem) => void;
  cachedBlob?: Blob | null;
  onBlobLoaded?: (blob: Blob) => void;
}

export const PdfCompressModal: React.FC<PdfCompressModalProps> = ({
  doc,
  isOpen,
  onClose,
  onOpenManagePages,
  onOpenMerge,
  cachedBlob,
  onBlobLoaded,
}) => {
  const { needsReconnect, reconnect } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  // Drive download state
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // PDF analysis state
  const [pdfMetadata, setPdfMetadata] = useState<PdfMetadata | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // Target size state
  const [selectedPresetId, setSelectedPresetId] = useState<string>('500kb');
  const [customTargetKb, setCustomTargetKb] = useState<string>('500');
  const [targetBytes, setTargetBytes] = useState<number>(500 * 1024);

  // Compression state
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStage, setCompressionStage] = useState<string>('');
  const [compressionPercent, setCompressionPercent] = useState<number>(0);
  const [compressionResult, setCompressionResult] = useState<PdfCompressionResult | null>(null);
  const [compressionError, setCompressionError] = useState<string | null>(null);

  // Sharing capability
  const [canShareFile, setCanShareFile] = useState(false);

  // Check Web Share API
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      try {
        const testFile = new File([''], 'test.pdf', { type: 'application/pdf' });
        setCanShareFile(navigator.canShare({ files: [testFile] }));
      } catch {
        setCanShareFile(false);
      }
    } else {
      setCanShareFile(false);
    }
  }, []);

  // Update targetBytes when preset or custom input changes
  useEffect(() => {
    if (selectedPresetId === 'custom') {
      const kb = Number(customTargetKb);
      if (!isNaN(kb) && kb > 0) {
        setTargetBytes(Math.round(kb * 1024));
      }
    } else {
      const preset = DEFAULT_PDF_PRESETS.find((p) => p.id === selectedPresetId);
      if (preset) {
        setTargetBytes(preset.bytes);
      }
    }
  }, [selectedPresetId, customTargetKb]);

  // Load original PDF from Google Drive on modal open
  useEffect(() => {
    if (!isOpen || !doc) {
      setOriginalBlob(null);
      setPdfMetadata(null);
      if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
      setThumbnailUrl(null);
      setCompressionResult(null);
      setCompressionError(null);
      setDownloadError(null);
      return;
    }

    const isPdf =
      doc.mimeType === 'application/pdf' ||
      /\.pdf$/i.test(doc.name);

    if (!isPdf) return;

    let isCancelled = false;
    setIsLoadingOriginal(true);
    setDownloadError(null);

    async function loadDrivePdf() {
      try {
        let blob = cachedBlob;
        if (!blob) {
          const res = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${doc!.id}?alt=media`
          );
          if (!res.ok) {
            throw new Error(
              `Failed to download PDF from Google Drive (HTTP ${res.status}: ${res.statusText})`
            );
          }
          blob = await res.blob();
        }

        if (isCancelled) return;

        setOriginalBlob(blob);
        onBlobLoaded?.(blob);

        // Analyze PDF metadata
        try {
          const meta = await analyzePdf(blob);
          if (!isCancelled) {
            setPdfMetadata(meta);

            // Render first page thumbnail
            renderPageThumbnail(blob);
          }
        } catch (analysisErr: any) {
          console.warn('Analysis note:', analysisErr.message);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setDownloadError(
            !navigator.onLine
              ? "You're offline. Original PDF cannot be downloaded from Google Drive until you are reconnected to the internet."
              : err.message ||
                "Couldn't download this PDF from Google Drive. Check your connection and try again."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingOriginal(false);
        }
      }
    }

    async function renderPageThumbnail(blob: Blob) {
      try {
        const arrayBuf = await blob.arrayBuffer();
        const task = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuf),
        });
        const pdf = await task.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          canvas.toBlob((thumbBlob) => {
            if (thumbBlob && !isCancelled) {
              const url = URL.createObjectURL(thumbBlob);
              setThumbnailUrl(url);
            }
          }, 'image/jpeg', 0.8);
        }
      } catch {
        // Thumbnail is optional
      }
    }

    loadDrivePdf();

    return () => {
      isCancelled = true;
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [isOpen, doc, reloadKey]);

  // Keyboard dismissal via Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // When re-authentication completes, auto-reload if PDF was not loaded
  const prevNeedsReconnectRef = useRef(needsReconnect);
  useEffect(() => {
    if (
      prevNeedsReconnectRef.current &&
      !needsReconnect &&
      isOpen &&
      doc &&
      !originalBlob &&
      !isLoadingOriginal
    ) {
      setReloadKey((k) => k + 1);
    }
    prevNeedsReconnectRef.current = needsReconnect;
  }, [needsReconnect, isOpen, doc, originalBlob, isLoadingOriginal]);

  if (!isOpen || !doc) return null;

  const handleCompress = async () => {
    if (!originalBlob) return;
    setIsCompressing(true);
    setCompressionError(null);
    setCompressionResult(null);
    setCompressionPercent(0);

    try {
      const result = await compressPdf({
        file: originalBlob,
        targetBytes,
        progressCallback: (stage, percent) => {
          setCompressionStage(stage);
          if (typeof percent === 'number') {
            setCompressionPercent(percent);
          }
        },
      });
      setCompressionResult(result);
    } catch (err: any) {
      console.error('PDF compression failed:', err);
      setCompressionError(
        err.message ||
          "We couldn't prepare this PDF. Your original Google Drive file is unchanged."
      );
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!compressionResult) return;
    const filename = generateOutputFilename(doc.name, targetBytes, 'application/pdf');
    const url = URL.createObjectURL(compressionResult.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleShare = async () => {
    if (!compressionResult || !canShareFile) return;
    try {
      const filename = generateOutputFilename(doc.name, targetBytes, 'application/pdf');
      const file = new File([compressionResult.blob], filename, {
        type: 'application/pdf',
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: doc.cleanTitle,
          text: `Prepared PDF: ${filename}`,
        });
      }
    } catch (err) {
      console.warn('Share operation cancelled or failed:', err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-compress-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2">
              <h2 id="pdf-compress-title" className="text-base font-bold text-white truncate">{doc.cleanTitle}</h2>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800 shrink-0">
                PDF
              </span>
            </div>
            <p className="text-xs text-neutral-400 truncate mt-0.5">{doc.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tool Navigation Bar */}
        <div className="px-4 sm:px-6 pt-3 pb-0 flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950/40 shrink-0">
          <button
            type="button"
            className="px-3.5 py-2 rounded-t-lg text-xs font-semibold bg-neutral-850 text-blue-400 border-t border-x border-neutral-700 -mb-px"
          >
            Compress Upload Size
          </button>
          {onOpenManagePages && (
            <button
              type="button"
              onClick={onOpenManagePages}
              className="px-3.5 py-2 rounded-t-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-850 cursor-pointer transition-colors"
            >
              Manage Pages (Rotate / Extract / Delete)
            </button>
          )}
          {onOpenMerge && doc && (
            <button
              type="button"
              onClick={() => onOpenMerge(doc)}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium text-purple-300 hover:text-purple-200 hover:bg-purple-950/40 border border-purple-800/60 cursor-pointer transition-colors flex items-center gap-1.5 mb-2"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Merge with other PDFs...</span>
            </button>
          )}
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* Reconnect Banner */}
          {needsReconnect && (
            <div className="p-4 bg-amber-950/60 border border-amber-800 rounded-xl text-xs text-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Google Drive session needs reconnect. Reconnect to download or prepare this PDF.</span>
              </div>
              <button
                type="button"
                onClick={reconnect}
                className="min-h-[36px] px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-black font-semibold rounded-lg text-xs flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reconnect Google
              </button>
            </div>
          )}

          {/* Drive Download Loader */}
          {isLoadingOriginal && (
            <div className="p-8 bg-neutral-950 rounded-2xl border border-neutral-800 text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
              <p className="text-xs text-neutral-300 font-medium">
                Downloading PDF from Google Drive into browser memory...
              </p>
              <p className="text-[11px] text-neutral-500">
                Transferred directly from Google's servers. 100% private.
              </p>
            </div>
          )}

          {/* Download Error */}
          {downloadError && (
            <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">Download Failed</p>
                  <p>{downloadError}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="min-h-[36px] px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium cursor-pointer shrink-0 transition-colors"
              >
                Retry Download
              </button>
            </div>
          )}

          {/* Original Document Overview Card */}
          {originalBlob && !isLoadingOriginal && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
              {/* Thumbnail / PDF Icon */}
              <div className="aspect-[3/4] max-h-40 sm:max-h-none bg-neutral-900 rounded-xl overflow-hidden flex items-center justify-center border border-neutral-800 relative">
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt="Page 1 Preview"
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-neutral-500">
                    <FileText className="w-8 h-8 text-blue-400" />
                    <span className="text-[10px] font-mono">Page 1</span>
                  </div>
                )}
                {pdfMetadata && (
                  <div className="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-black/80 border border-neutral-700 text-[10px] text-white font-mono flex items-center gap-1">
                    <Layers className="w-2.5 h-2.5 text-blue-400" />
                    <span>{pdfMetadata.pageCount} {pdfMetadata.pageCount === 1 ? 'page' : 'pages'}</span>
                  </div>
                )}
              </div>

              {/* Document Metadata Details */}
              <div className="sm:col-span-2 flex flex-col justify-between py-1 space-y-3">
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Original Size:</span>
                    <strong className="text-neutral-100 font-mono text-sm">
                      {formatFileSize(doc.size)}
                    </strong>
                  </div>

                  {pdfMetadata && (
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-400">Total Pages:</span>
                      <span className="text-neutral-200 font-mono font-medium">
                        {pdfMetadata.pageCount} pages
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Category:</span>
                    <span className="text-blue-400 font-medium">{doc.category}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-neutral-400">Folder Path:</span>
                    <span className="text-neutral-300 truncate max-w-[200px]" title={doc.folderPath}>
                      {doc.folderPath}
                    </span>
                  </div>

                  {/* Mode / Type Hint */}
                  {pdfMetadata && (
                    <div className="pt-1">
                      {pdfMetadata.hasSelectableText ? (
                        <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-800/60 text-[11px] text-blue-300 flex items-start gap-1.5">
                          <Check className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                          <span>Selectable text detected. Structure-preserving optimization will be attempted first.</span>
                        </div>
                      ) : (
                        <div className="p-2 rounded-lg bg-neutral-900 border border-neutral-800 text-[11px] text-neutral-300 flex items-start gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span>Scanned / Image document. Pages will be compressed as images.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Safety Guarantee */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-900/80 border border-neutral-800 text-[11px] text-emerald-400">
                  <Shield className="w-3.5 h-3.5 shrink-0" />
                  <span>Original Google Drive file is permanently unchanged.</span>
                </div>
              </div>
            </div>
          )}

          {/* Target Size Selection Form */}
          {originalBlob && !isLoadingOriginal && !compressionResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-blue-400" />
                  <span>Choose Target Upload Size</span>
                </label>
                <span className="text-xs text-neutral-400">
                  Target: <strong className="text-blue-400 font-mono">{formatFileSize(targetBytes)}</strong>
                </span>
              </div>

              {/* Preset Buttons */}
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                {DEFAULT_PDF_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setSelectedPresetId(preset.id)}
                    className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all border text-center flex flex-col items-center justify-center ${
                      selectedPresetId === preset.id
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                        : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border-neutral-800'
                    }`}
                  >
                    <span>{preset.label}</span>
                  </button>
                ))}

                {/* Custom Button */}
                <button
                  type="button"
                  onClick={() => setSelectedPresetId('custom')}
                  className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all border text-center flex flex-col items-center justify-center ${
                    selectedPresetId === 'custom'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-neutral-950 hover:bg-neutral-800 text-neutral-300 border-neutral-800'
                  }`}
                >
                  <span>Custom</span>
                </button>
              </div>

              {/* Custom Input */}
              {selectedPresetId === 'custom' && (
                <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-2">
                  <label htmlFor="pdf-custom-target-kb" className="text-xs text-neutral-300 font-medium">Custom Target Size (KB)</label>
                  <div className="flex items-center gap-2">
                    <input
                      id="pdf-custom-target-kb"
                      aria-label="Custom target size in kilobytes"
                      type="number"
                      min="10"
                      max="50000"
                      value={customTargetKb}
                      onChange={(e) => setCustomTargetKb(e.target.value)}
                      placeholder="e.g. 350"
                      className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-blue-500"
                    />
                    <span className="text-xs text-neutral-400 font-mono">KB</span>
                  </div>
                </div>
              )}

              {/* Prepare Button */}
              <button
                type="button"
                onClick={handleCompress}
                disabled={isCompressing}
                className="w-full min-h-[48px] px-5 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors disabled:opacity-50"
              >
                {isCompressing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{compressionStage || 'Preparing PDF...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Prepare for Upload ({formatFileSize(targetBytes)})</span>
                  </>
                )}
              </button>

              {/* Compression Progress Bar */}
              {isCompressing && (
                <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                  <div className="flex justify-between text-xs text-neutral-400">
                    <span className="truncate pr-2">{compressionStage}</span>
                    <span className="font-mono">{compressionPercent}%</span>
                  </div>
                  <div className="w-full bg-neutral-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${Math.max(5, compressionPercent)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Compression Error */}
          {compressionError && (
            <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Preparation Notice</p>
                <p className="mt-0.5 leading-relaxed">{compressionError}</p>
              </div>
            </div>
          )}

          {/* Output Result Screen */}
          {compressionResult && (
            <div className="space-y-5 animate-in fade-in duration-200">
              {/* Status Banner */}
              <div
                className={`p-4 rounded-xl text-xs flex items-center justify-between border ${
                  compressionResult.achievedTarget
                    ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                    : 'bg-amber-950/40 border-amber-800 text-amber-300'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {compressionResult.achievedTarget ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  )}
                  <div>
                    <p className="font-semibold text-sm">
                      {compressionResult.achievedTarget
                        ? 'PDF Ready for Upload'
                        : 'Readability Protection Floor Reached'}
                    </p>
                    <p className="opacity-90 mt-0.5">
                      {compressionResult.statusMessage ||
                        (compressionResult.achievedTarget
                          ? 'Successfully prepared below your target upload size.'
                          : 'Target size would make text unreadable. Prepared best readable copy.')}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold px-2 py-1 rounded bg-black/40 border border-neutral-700 shrink-0">
                  -{compressionResult.reductionPercentage}%
                </span>
              </div>

              {/* Metrics Grid */}
              <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 space-y-3 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
                  <span className="text-neutral-400">Original Document Size:</span>
                  <span className="font-mono text-neutral-300 line-through">
                    {formatFileSize(compressionResult.originalBytes)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Target Maximum:</span>
                  <span className="font-mono text-blue-400 font-medium">
                    {formatFileSize(targetBytes)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-sm font-semibold">
                  <span className="text-neutral-200">Prepared Output Size:</span>
                  <span
                    className={`font-mono text-base ${
                      compressionResult.achievedTarget ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {formatFileSize(compressionResult.outputBytes)}
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Page Count:</span>
                  <span className="font-mono text-neutral-200">
                    {compressionResult.pageCount} pages (100% verified)
                  </span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Processing Mode:</span>
                  <span className="font-medium text-neutral-200">
                    {compressionResult.mode === 'optimized-structure'
                      ? 'Optimized PDF Structure (text & vectors preserved)'
                      : compressionResult.mode === 'original-unchanged'
                      ? 'Original File (already below target)'
                      : 'Compressed Page Images (rasterized)'}
                  </span>
                </div>
              </div>

              {/* Download and Share Actions */}
              <div className="space-y-2.5">
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="flex-1 min-h-[48px] px-5 py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Prepared PDF</span>
                  </button>

                  {canShareFile && (
                    <button
                      type="button"
                      onClick={handleShare}
                      className="min-h-[48px] px-5 py-3 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                      <span>Share</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCompressionResult(null)}
                  className="w-full min-h-[40px] px-4 py-2 bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-white rounded-xl text-xs font-medium cursor-pointer transition-colors border border-neutral-800"
                >
                  Adjust target size and prepare again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 border-t border-neutral-800/80 bg-neutral-950/60 rounded-b-2xl flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Strictly client-side &bull; Zero server uploads</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] px-3.5 py-1 text-neutral-400 hover:text-white rounded-lg text-xs font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
