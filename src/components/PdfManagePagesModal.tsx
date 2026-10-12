import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  RotateCw,
  Trash2,
  Download,
  Share2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Scissors,
  FileText,
  RotateCcw,
  Sparkles,
  Layers,
} from 'lucide-react';
import type { DocItem } from '../types';
import {
  modifyPdfPages,
  parsePageRanges,
  type PdfToolResult,
  type PageConfig,
} from '../services/pdfTools';
import { driveFetch } from '../services/driveFetch';
import { formatFileSize } from '../utils/folder';
import { generatePageToolFilename } from '../utils/filename';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

interface PdfManagePagesModalProps {
  doc: DocItem | null;
  isOpen: boolean;
  onClose: () => void;
  preloadedBlob?: Blob | null;
  onOpenCompress?: () => void;
  onOpenMerge?: (doc: DocItem) => void;
  onBlobLoaded?: (blob: Blob) => void;
}

interface PageTile {
  id: string; // unique ID
  originalIndex: number; // 0-based original index
  displayNum: number; // 1-based original
  rotation: number; // 0, 90, 180, 270
  isSelected: boolean;
  thumbnailUrl?: string;
}

export const PdfManagePagesModal: React.FC<PdfManagePagesModalProps> = ({
  doc,
  isOpen,
  onClose,
  preloadedBlob,
  onOpenCompress,
  onOpenMerge,
  onBlobLoaded,
}) => {
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(preloadedBlob || null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  // Pages state
  const [pages, setPages] = useState<PageTile[]>([]);
  const [originalPageCount, setOriginalPageCount] = useState(0);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [processResult, setProcessResult] = useState<PdfToolResult | null>(null);
  const [outputAction, setOutputAction] = useState<'modified' | 'extracted'>('modified');
  const [processError, setProcessError] = useState<string | null>(null);

  // Range and confirmation state (Milestone 4)
  const [pageRangeInput, setPageRangeInput] = useState('');
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [deleteConfirmCount, setDeleteConfirmCount] = useState<number | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  // Sharing capability & download
  const [canShare, setCanShare] = useState(false);
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);

  // Keep track of created thumbnail URLs to revoke on unmount
  const thumbnailUrlsRef = useRef<string[]>([]);

  const revokeAllThumbnails = () => {
    thumbnailUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    });
    thumbnailUrlsRef.current = [];
  };

  // Check Web Share API
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      try {
        const dummyFile = new File([''], 'test.pdf', { type: 'application/pdf' });
        setCanShare(navigator.canShare({ files: [dummyFile] }));
      } catch {
        setCanShare(false);
      }
    }
  }, []);

  // Load PDF when modal opens
  useEffect(() => {
    if (!isOpen || !doc) {
      setOriginalBlob(null);
      setPages([]);
      setProcessResult(null);
      setProcessError(null);
      setLoadingError(null);
      revokeAllThumbnails();
      return;
    }

    let isCancelled = false;

    async function loadPdf() {
      setIsLoadingFile(true);
      setLoadingError(null);
      setProcessResult(null);

      try {
        let blob = preloadedBlob;
        if (!blob) {
          const res = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${doc!.id}?alt=media`
          );
          if (!res.ok) {
            throw new Error(`Failed to download PDF from Google Drive (HTTP ${res.status})`);
          }
          blob = await res.blob();
        }

        if (isCancelled) return;
        setOriginalBlob(blob);
        onBlobLoaded?.(blob);

        // Load with PDF.js to inspect page count and render thumbnails
        const buf = await blob.arrayBuffer();
        const task = pdfjsLib.getDocument({ data: new Uint8Array(buf) });
        const pdf = await task.promise;
        const total = pdf.numPages;

        if (isCancelled) return;
        setOriginalPageCount(total);

        // Initialize page tiles
        const initialTiles: PageTile[] = [];
        for (let i = 0; i < total; i++) {
          initialTiles.push({
            id: `p-${i}-${Date.now()}`,
            originalIndex: i,
            displayNum: i + 1,
            rotation: 0,
            isSelected: false,
          });
        }
        setPages(initialTiles);

        // Render thumbnails in background
        renderThumbnails(pdf, total);
      } catch (err: any) {
        if (!isCancelled) {
          setLoadingError(
            !navigator.onLine
              ? "You're offline. Original PDF cannot be downloaded from Google Drive until you are reconnected to the internet."
              : err.message || 'Could not open this PDF document.'
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingFile(false);
        }
      }
    }

    async function renderThumbnails(
      pdf: pdfjsLib.PDFDocumentProxy,
      total: number
    ) {
      for (let i = 1; i <= total; i++) {
        if (isCancelled) break;
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.35 });

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
                thumbnailUrlsRef.current.push(url);
                setPages((prev) =>
                  prev.map((tile) =>
                    tile.originalIndex === i - 1 ? { ...tile, thumbnailUrl: url } : tile
                  )
                );
              }
            }, 'image/jpeg', 0.75);
          }
        } catch {
          // Thumbnail rendering is optional fallback
        }
      }
    }

    loadPdf();

    return () => {
      isCancelled = true;
      revokeAllThumbnails();
    };
  }, [isOpen, doc, preloadedBlob, onBlobLoaded]);

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

  // Clean up result blob URL
  useEffect(() => {
    return () => {
      if (resultBlobUrl) {
        URL.revokeObjectURL(resultBlobUrl);
      }
    };
  }, [resultBlobUrl]);

  if (!isOpen || !doc) return null;

  // Selected count
  const selectedCount = pages.filter((p) => p.isSelected).length;

  // Reordering controls
  const handleMoveLeft = (index: number) => {
    if (index <= 0) return;
    const newPages = [...pages];
    const temp = newPages[index - 1];
    newPages[index - 1] = newPages[index];
    newPages[index] = temp;
    setPages(newPages);
  };

  const handleMoveRight = (index: number) => {
    if (index >= pages.length - 1) return;
    const newPages = [...pages];
    const temp = newPages[index + 1];
    newPages[index + 1] = newPages[index];
    newPages[index] = temp;
    setPages(newPages);
  };

  // Rotation controls
  const handleRotatePage = (index: number) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p))
    );
  };

  const handleRotateSelected = (delta: number) => {
    setPages((prev) =>
      prev.map((p) => (p.isSelected ? { ...p, rotation: (p.rotation + delta) % 360 } : p))
    );
  };

  // Selection controls
  const handleToggleSelectPage = (index: number) => {
    setPages((prev) =>
      prev.map((p, i) => (i === index ? { ...p, isSelected: !p.isSelected } : p))
    );
  };

  const handleSelectAll = () => {
    setPages((prev) => prev.map((p) => ({ ...p, isSelected: true })));
  };

  const handleDeselectAll = () => {
    setPages((prev) => prev.map((p) => ({ ...p, isSelected: false })));
  };

  // Deletion controls with confirmation warning (Milestone 4)
  const handleDeletePage = (index: number) => {
    if (pages.length <= 1) {
      setProcessError('Cannot delete this page: a PDF must have at least one page.');
      return;
    }
    setProcessError(null);
    setPendingDeleteIndex(index);
    setDeleteConfirmCount(1);
  };

  const handleDeleteSelected = () => {
    if (selectedCount === 0) return;
    if (selectedCount >= pages.length) {
      setProcessError('Cannot delete all pages: a PDF must have at least one page.');
      return;
    }
    setProcessError(null);
    setPendingDeleteIndex(null);
    setDeleteConfirmCount(selectedCount);
  };

  const handleConfirmDelete = () => {
    if (pendingDeleteIndex !== null) {
      setPages((prev) => prev.filter((_, i) => i !== pendingDeleteIndex));
    } else if (deleteConfirmCount !== null) {
      setPages((prev) => prev.filter((p) => !p.isSelected));
    }
    setDeleteConfirmCount(null);
    setPendingDeleteIndex(null);
    setProcessError(null);
  };

  const handleCancelDelete = () => {
    setDeleteConfirmCount(null);
    setPendingDeleteIndex(null);
  };

  // Page range selection & extraction (Milestone 4)
  const handleApplyPageRange = (extractImmediately: boolean = false) => {
    setRangeError(null);
    if (!pageRangeInput.trim()) {
      setRangeError('Please enter a page range (e.g. 1-3, 5).');
      return;
    }

    try {
      const indices = parsePageRanges(pageRangeInput, pages.length);
      if (indices.length === 0) {
        setRangeError('No pages found in range.');
        return;
      }
      const indexSet = new Set(indices);
      const updatedPages = pages.map((p, idx) => ({
        ...p,
        isSelected: indexSet.has(idx),
      }));
      setPages(updatedPages);
      setPageRangeInput('');

      if (extractImmediately) {
        const selectedTiles = updatedPages.filter((p) => p.isSelected);
        handleExtractPagesInternal(selectedTiles);
      }
    } catch (err: any) {
      setRangeError(err.message || 'Invalid page range');
    }
  };

  // Reset to original
  const handleReset = () => {
    setProcessError(null);
    const initialTiles: PageTile[] = [];
    for (let i = 0; i < originalPageCount; i++) {
      const existingThumb = pages.find((p) => p.originalIndex === i)?.thumbnailUrl;
      initialTiles.push({
        id: `p-${i}-${Date.now()}`,
        originalIndex: i,
        displayNum: i + 1,
        rotation: 0,
        isSelected: false,
        thumbnailUrl: existingThumb,
      });
    }
    setPages(initialTiles);
  };

  // Processing execution: Apply modified pages
  const handleApplyChanges = async () => {
    if (!originalBlob || pages.length === 0) {
      setProcessError('A PDF must have at least one page.');
      return;
    }

    setIsProcessing(true);
    setProcessError(null);
    setOutputAction('modified');

    try {
      const configs: PageConfig[] = pages.map((p) => ({
        originalIndex: p.originalIndex,
        rotationDelta: p.rotation,
      }));

      const res = await modifyPdfPages(originalBlob, configs, (stage, pct) => {
        setProcessingStage(stage);
        if (pct) setProcessingPercent(pct);
      });

      const url = URL.createObjectURL(res.blob);
      setResultBlobUrl(url);
      setProcessResult(res);
    } catch (err: any) {
      console.error('Page modification failed:', err);
      setProcessError(err.message || 'Failed to apply page modifications.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Extract pages into new PDF
  const handleExtractPagesInternal = async (targetPages: PageTile[]) => {
    if (!originalBlob) return;
    if (targetPages.length === 0) {
      setProcessError('Please select at least one page to extract.');
      return;
    }

    setIsProcessing(true);
    setProcessError(null);
    setOutputAction('extracted');

    try {
      const configs: PageConfig[] = targetPages.map((p) => ({
        originalIndex: p.originalIndex,
        rotationDelta: p.rotation,
      }));

      const res = await modifyPdfPages(originalBlob, configs, (stage, pct) => {
        setProcessingStage(stage);
        if (pct) setProcessingPercent(pct);
      });

      const url = URL.createObjectURL(res.blob);
      setResultBlobUrl(url);
      setProcessResult(res);
    } catch (err: any) {
      console.error('Page extraction failed:', err);
      setProcessError(err.message || 'Failed to extract selected pages.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExtractSelected = () => {
    const selected = pages.filter((p) => p.isSelected);
    handleExtractPagesInternal(selected);
  };

  const outputFilename = generatePageToolFilename(doc.name, outputAction);

  const handleDownload = () => {
    if (!resultBlobUrl) return;
    const a = document.createElement('a');
    a.href = resultBlobUrl;
    a.download = outputFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!processResult || !canShare) return;
    try {
      const file = new File([processResult.blob], outputFilename, {
        type: 'application/pdf',
      });
      await navigator.share({
        files: [file],
        title: outputFilename,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Sharing failed:', err);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-manage-pages-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-950/60 border border-blue-800/80 text-blue-300 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="pdf-manage-pages-title" className="font-semibold text-base sm:text-lg text-white truncate leading-tight">
                Manage Pages &bull; {doc.cleanTitle}
              </h2>
              <p className="text-xs text-neutral-400 truncate mt-0.5">
                Rotate, reorder, delete or extract pages &bull; 100% Client-side
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tool Navigation Bar */}
        <div className="px-4 sm:px-6 pt-3 pb-0 flex flex-wrap items-center gap-2 border-b border-neutral-800 bg-neutral-950/40">
          {onOpenCompress && (
            <button
              type="button"
              onClick={onOpenCompress}
              className="px-3.5 py-2 rounded-t-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-neutral-850 cursor-pointer transition-colors"
            >
              Compress Target Size
            </button>
          )}
          <button
            type="button"
            className="px-3.5 py-2 rounded-t-lg text-xs font-semibold bg-neutral-850 text-blue-400 border-t border-x border-neutral-700 -mb-px"
          >
            Manage Pages (Rotate / Extract / Delete)
          </button>
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Loading state */}
          {isLoadingFile && (
            <div className="py-16 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
              <p className="text-sm text-neutral-300">Loading document pages...</p>
            </div>
          )}

          {/* Load error */}
          {loadingError && (
            <div className="p-4 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-3 text-sm text-red-200">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
              <span>{loadingError}</span>
            </div>
          )}

          {/* Success Result View */}
          {!isLoadingFile && processResult && (
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-emerald-200">
                    {outputAction === 'extracted' ? 'Pages Extracted Successfully!' : 'PDF Updated Successfully!'}
                  </h3>
                  <p className="text-xs text-emerald-300/80">
                    {outputAction === 'extracted'
                      ? `Extracted ${processResult.pageCount} pages into a new document.`
                      : `Applied reorder, rotation, and deletion across ${processResult.pageCount} pages.`}
                  </p>
                </div>
              </div>

              {/* Stats Card */}
              <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs pb-3 border-b border-neutral-800/70">
                  <span className="text-neutral-400">Output File</span>
                  <span className="font-mono text-neutral-200 font-medium">{outputFilename}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Pages</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {originalPageCount} &rarr; {processResult.pageCount}
                    </span>
                  </div>
                  <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Output Size</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {formatFileSize(processResult.outputBytes)}
                    </span>
                  </div>
                  <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Duration</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {processResult.durationMs}ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 min-h-[46px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                {canShare && (
                  <button
                    type="button"
                    onClick={handleShare}
                    className="min-h-[46px] px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-200 rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setProcessResult(null);
                    setResultBlobUrl(null);
                  }}
                  className="min-h-[46px] px-4 py-2.5 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 rounded-xl font-medium text-sm flex items-center justify-center cursor-pointer transition-colors"
                >
                  Keep Editing
                </button>
              </div>
            </div>
          )}

          {/* Interactive Page Editor View */}
          {!isLoadingFile && !loadingError && !processResult && (
            <>
              {/* Toolbar Controls */}
              <div className="bg-neutral-950/70 border border-neutral-800 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                {/* Left: Selection actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={selectedCount === pages.length ? handleDeselectAll : handleSelectAll}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium cursor-pointer transition-colors"
                  >
                    {selectedCount === pages.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-neutral-500">
                    {selectedCount} of {pages.length} selected
                  </span>
                </div>

                {/* Right: Operations on selection */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Rotation buttons */}
                  <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleRotateSelected(90)}
                      disabled={selectedCount === 0}
                      className="px-2 py-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 cursor-pointer transition-colors flex items-center gap-1"
                      title="Rotate selected +90°"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>90°</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRotateSelected(180)}
                      disabled={selectedCount === 0}
                      className="px-2 py-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 border-l border-neutral-800 cursor-pointer transition-colors"
                      title="Rotate selected +180°"
                    >
                      180°
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRotateSelected(270)}
                      disabled={selectedCount === 0}
                      className="px-2 py-1.5 hover:bg-neutral-800 text-neutral-300 hover:text-white disabled:opacity-40 border-l border-neutral-800 cursor-pointer transition-colors"
                      title="Rotate selected +270°"
                    >
                      270°
                    </button>
                  </div>

                  {/* Extract Selected */}
                  <button
                    type="button"
                    onClick={handleExtractSelected}
                    disabled={selectedCount === 0}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-800/60 font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer transition-colors"
                    title="Extract selected pages into a new PDF"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Extract</span>
                  </button>

                  {/* Delete Selected */}
                  <button
                    type="button"
                    onClick={handleDeleteSelected}
                    disabled={selectedCount === 0 || selectedCount >= pages.length}
                    className="px-2.5 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/60 font-medium flex items-center gap-1.5 disabled:opacity-40 cursor-pointer transition-colors"
                    title={
                      selectedCount >= pages.length
                        ? 'Cannot delete all pages'
                        : 'Delete selected pages'
                    }
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>

                  {/* Reset */}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white font-medium flex items-center gap-1 cursor-pointer transition-colors"
                    title="Reset to original order and rotation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Range Selection Input (Milestone 4) */}
                <div className="flex items-center gap-2 pt-2 border-t border-neutral-800/80 w-full text-xs flex-wrap">
                  <span className="text-neutral-400 font-medium shrink-0">Range:</span>
                  <input
                    type="text"
                    value={pageRangeInput}
                    onChange={(e) => {
                      setPageRangeInput(e.target.value);
                      if (rangeError) setRangeError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyPageRange(false);
                      }
                    }}
                    placeholder="e.g. 1-3, 5"
                    className="w-28 sm:w-36 px-2.5 py-1 bg-neutral-900 border border-neutral-700/80 rounded-lg text-white placeholder-neutral-500 text-xs focus:outline-hidden focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleApplyPageRange(false)}
                    className="px-2.5 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-medium cursor-pointer transition-colors"
                  >
                    Select Range
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPageRange(true)}
                    className="px-2.5 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 border border-blue-800/60 font-medium cursor-pointer transition-colors"
                  >
                    Extract Range
                  </button>
                  {rangeError && (
                    <span className="text-red-400 text-[11px] font-medium">{rangeError}</span>
                  )}
                </div>
              </div>

              {/* Destructive Operation Confirmation Warning (Milestone 4) */}
              {deleteConfirmCount !== null && (
                <div className="p-3 bg-red-950/80 border border-red-700 rounded-xl flex items-center justify-between gap-3 text-xs text-red-200 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="font-medium">
                      Warning: Deleting {deleteConfirmCount} of {pages.length} page{pages.length === 1 ? '' : 's'}. This removes {deleteConfirmCount === 1 ? 'it' : 'them'} from the working copy.
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleConfirmDelete}
                      className="px-3 py-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white rounded-lg font-bold cursor-pointer transition-colors"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelDelete}
                      className="px-3 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-lg font-medium cursor-pointer transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Error banner */}
              {processError && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-2 text-xs text-red-200">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{processError}</span>
                </div>
              )}

              {/* Page Tiles Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {pages.map((p, index) => (
                  <div
                    key={p.id}
                    onClick={() => handleToggleSelectPage(index)}
                    className={`relative rounded-xl border p-2 flex flex-col justify-between gap-2 transition-all cursor-pointer select-none group ${
                      p.isSelected
                        ? 'bg-blue-950/40 border-blue-500 shadow-md shadow-blue-950/50'
                        : 'bg-neutral-950/70 hover:bg-neutral-850 border-neutral-800'
                    }`}
                  >
                    {/* Top Tile Bar: Checkbox & Original Page Number */}
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center border text-xs font-semibold ${
                          p.isSelected
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                        }`}
                      >
                        {p.isSelected && <Check className="w-3 h-3" />}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {p.rotation > 0 && (
                          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-800/80 text-amber-300">
                            {p.rotation}&deg;
                          </span>
                        )}
                        <span className="text-[11px] font-mono text-neutral-400 font-medium">
                          P.{p.displayNum}
                        </span>
                      </div>
                    </div>

                    {/* Thumbnail Canvas / Preview */}
                    <div className="w-full aspect-[3/4] bg-neutral-900 rounded-lg overflow-hidden flex items-center justify-center relative border border-neutral-800/80">
                      {p.thumbnailUrl ? (
                        <img
                          src={p.thumbnailUrl}
                          alt={`Page ${p.displayNum}`}
                          className="w-full h-full object-contain transition-transform duration-200"
                          style={{ transform: `rotate(${p.rotation}deg)` }}
                        />
                      ) : (
                        <div className="text-center text-neutral-600 p-2">
                          <FileText className="w-8 h-8 mx-auto opacity-40 mb-1" />
                          <span className="text-[11px] font-mono block">Page {p.displayNum}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Controls Bar: Move Left, Rotate, Move Right, Delete */}
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-between gap-1 pt-1 border-t border-neutral-800/60"
                    >
                      <button
                        type="button"
                        onClick={() => handleMoveLeft(index)}
                        disabled={index === 0}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-800 disabled:opacity-20 text-neutral-400 hover:text-white cursor-pointer transition-colors"
                        title="Move earlier"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRotatePage(index)}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-800 text-neutral-400 hover:text-white cursor-pointer transition-colors"
                        title="Rotate 90° clockwise"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleMoveRight(index)}
                        disabled={index === pages.length - 1}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-neutral-800 disabled:opacity-20 text-neutral-400 hover:text-white cursor-pointer transition-colors"
                        title="Move later"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeletePage(index)}
                        disabled={pages.length <= 1}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-950/80 disabled:opacity-20 text-neutral-500 hover:text-red-400 cursor-pointer transition-colors"
                        title="Delete page"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Processing Progress */}
              {isProcessing && (
                <div className="space-y-2 p-3.5 bg-neutral-950 border border-blue-900/50 rounded-xl animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-blue-300 font-medium flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                      {processingStage || 'Processing pages...'}
                    </span>
                    <span className="text-neutral-400 font-mono">{processingPercent}%</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${processingPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleApplyChanges}
                  disabled={pages.length === 0 || isProcessing}
                  className="flex-1 min-h-[48px] px-6 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-blue-900/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {isProcessing
                    ? 'Processing...'
                    : `Apply Changes (${pages.length} Pages)`}
                </button>

                {selectedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleExtractSelected}
                    disabled={isProcessing}
                    className="min-h-[48px] px-5 py-3 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-200 border border-neutral-700 rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Scissors className="w-4 h-4" />
                    Extract Selected ({selectedCount})
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-neutral-950/90 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500 shrink-0">
          <span>{pages.length} pages currently arranged</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-neutral-300 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
