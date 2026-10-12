import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Sparkles,
  Scissors,
  Layers,
  FileText,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Share2,
} from 'lucide-react';
import type { DocItem } from '../types';
import { driveFetch } from '../services/driveFetch';
import { getDriveFetchStrategy } from '../utils/driveEndpoints';
import { formatFileSize } from '../utils/folder';
import { useAuth } from '../hooks/useAuth';
import { shareOrDownloadFile, triggerBrowserDownload } from '../utils/fileShare';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

interface DocumentPreviewModalProps {
  doc: DocItem | null;
  isOpen: boolean;
  onClose: () => void;
  cachedBlob?: Blob | null;
  onOpenCompress?: (doc: DocItem, blob: Blob) => void;
  onOpenManagePages?: (doc: DocItem, blob: Blob) => void;
  onOpenMerge?: (doc: DocItem, blob: Blob) => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  doc,
  isOpen,
  onClose,
  cachedBlob,
  onOpenCompress,
  onOpenManagePages,
  onOpenMerge,
}) => {
  const { needsReconnect, reconnect } = useAuth();

  // Resource state
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Zoom / View state
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [pdfPageCount, setPdfPageCount] = useState<number>(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState<number>(1);
  const [pdfDocProxy, setPdfDocProxy] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeUrlRef = useRef<string | null>(null);

  // Clean up object URLs to prevent memory leaks
  const cleanupBlobUrl = () => {
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
    }
    setBlobUrl(null);
  };

  // Reset & load document whenever doc changes or modal opens
  useEffect(() => {
    if (!isOpen || !doc) {
      cleanupBlobUrl();
      setBlob(null);
      setErrorMessage(null);
      setIsLoading(false);
      setPdfDocProxy(null);
      setPdfPageCount(0);
      setPdfCurrentPage(1);
      setZoomLevel(1);
      return;
    }

    let isCancelled = false;
    cleanupBlobUrl();
    setBlob(null);
    setErrorMessage(null);
    setZoomLevel(1);
    setPdfPageCount(0);
    setPdfCurrentPage(1);
    setPdfDocProxy(null);

    // If preloaded/dropped blob is provided, use it directly
    if (cachedBlob) {
      const url = URL.createObjectURL(cachedBlob);
      activeUrlRef.current = url;
      setBlob(cachedBlob);
      setBlobUrl(url);
      setIsLoading(false);
      return;
    }

    // Determine strategy for Google Drive API
    const strategy = getDriveFetchStrategy(doc);
    if (!strategy.isSupported && strategy.unsupportedReason) {
      setErrorMessage(strategy.unsupportedReason);
      return;
    }

    setIsLoading(true);

    async function fetchDocument() {
      try {
        const response = await driveFetch(strategy.url);

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Document not found in Google Drive. It may have been deleted or moved.');
          }
          if (response.status === 403) {
            throw new Error('Access denied. Please check your Google Drive permissions.');
          }
          if (response.status === 401) {
            throw new Error('Google Drive authorization expired. Please click Reconnect Google.');
          }
          throw new Error(`Failed to load document (HTTP ${response.status}: ${response.statusText})`);
        }

        const dataBlob = await response.blob();

        if (dataBlob.size === 0) {
          throw new Error('The document returned by Google Drive is empty (0 bytes).');
        }

        if (isCancelled) return;

        // Ensure correct mimeType for blob URL rendering
        const finalBlob = strategy.isExport
          ? new Blob([dataBlob], { type: 'application/pdf' })
          : dataBlob;

        const url = URL.createObjectURL(finalBlob);
        activeUrlRef.current = url;
        setBlob(finalBlob);
        setBlobUrl(url);
      } catch (err: any) {
        if (!isCancelled) {
          console.error('Error fetching preview document:', err);
          setErrorMessage(
            !navigator.onLine
              ? "You are offline. This document cannot be downloaded from Google Drive until reconnected."
              : err.message || 'Failed to load preview for this document.'
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchDocument();

    return () => {
      isCancelled = true;
      cleanupBlobUrl();
    };
  }, [isOpen, doc, cachedBlob]);

  // Load PDF with PDF.js for canvas rendering
  useEffect(() => {
    if (!blob || !doc) return;

    const strategy = getDriveFetchStrategy(doc);
    if (strategy.previewType !== 'pdf') return;

    let isCancelled = false;

    async function loadPdfDocument() {
      try {
        const arrayBuf = await blob!.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) });
        const pdf = await loadingTask.promise;

        if (isCancelled) return;
        setPdfDocProxy(pdf);
        setPdfPageCount(pdf.numPages);
        setPdfCurrentPage(1);
      } catch (err) {
        console.warn('PDF.js canvas inspection note:', err);
      }
    }

    loadPdfDocument();

    return () => {
      isCancelled = true;
    };
  }, [blob, doc]);

  // Render current PDF page on canvas
  useEffect(() => {
    if (!pdfDocProxy || !canvasRef.current || pdfPageCount === 0) return;

    let isCancelled = false;

    async function renderPage() {
      try {
        const page = await pdfDocProxy!.getPage(pdfCurrentPage);
        if (isCancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = Math.min(window.innerWidth * 0.85, 900);
        const scale = (targetWidth / baseViewport.width) * zoomLevel;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
        }).promise;
      } catch (err) {
        console.warn('Error rendering PDF page on canvas:', err);
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfDocProxy, pdfCurrentPage, zoomLevel]);

  // Download document
  const getDownloadFilename = () => {
    if (!doc) return 'document';
    const strategy = getDriveFetchStrategy(doc);
    return strategy.isExport && !doc.name.toLowerCase().endsWith('.pdf')
      ? `${doc.name.replace(/\.[^.]+$/, '')}.pdf`
      : doc.name;
  };

  // Download document
  const handleDownload = () => {
    if (!blob || !doc) return;
    triggerBrowserDownload(blob, getDownloadFilename());
  };

  // Native Web Share document
  const handleShare = async () => {
    if (!blob || !doc) return;
    await shareOrDownloadFile({
      blob,
      filename: getDownloadFilename(),
      title: doc.cleanTitle || doc.name,
    });
  };

  if (!isOpen || !doc) return null;

  const strategy = getDriveFetchStrategy(doc);
  const isPdf = strategy.previewType === 'pdf';
  const isImage = strategy.previewType === 'image';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Document Preview: ${doc.cleanTitle || doc.name}`}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex flex-col justify-between p-2 sm:p-4 text-white overflow-hidden pt-[max(0.5rem,env(safe-area-inset-top,0px))] pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] pl-[max(0.5rem,env(safe-area-inset-left,0px))] pr-[max(0.5rem,env(safe-area-inset-right,0px))]"
    >
      {/* Top Header Bar */}
      <header className="flex items-center justify-between gap-2 sm:gap-3 bg-neutral-900/90 border border-white/10 rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 shrink-0 z-10 shadow-lg">
        {/* Document Icon & Title */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              isPdf
                ? 'bg-rose-500/15 border-rose-400/30 text-rose-400'
                : isImage
                ? 'bg-sky-500/15 border-sky-400/30 text-sky-400'
                : 'bg-neutral-800 border-neutral-700 text-neutral-400'
            }`}
          >
            {isPdf ? <FileText className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-sm sm:text-base text-neutral-100 truncate">
              {doc.cleanTitle || doc.name}
            </h2>
            <p className="text-xs text-neutral-400 truncate">
              {strategy.isExport ? 'Google Doc (Exported PDF)' : doc.mimeType} &bull; {formatFileSize(doc.size)}
            </p>
          </div>
        </div>

        {/* Action Buttons: Compress, Pages, Merge, Share, Download, Close */}
        <div className="flex items-center gap-1 sm:gap-2">
          {blob && onOpenCompress && (isPdf || isImage) && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCompress(doc, blob);
              }}
              className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
              title="Compress to upload target size"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Compress</span>
            </button>
          )}

          {blob && isPdf && onOpenManagePages && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenManagePages(doc, blob);
              }}
              className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-950/80 hover:bg-sky-900 border border-sky-700 text-sky-300 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="Manage PDF pages"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Pages</span>
            </button>
          )}

          {blob && isPdf && onOpenMerge && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMerge(doc, blob);
              }}
              className="min-h-[40px] px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-300 font-semibold text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="Merge PDF"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Merge</span>
            </button>
          )}

          {blob && (
            <button
              type="button"
              onClick={handleShare}
              className="min-w-[40px] min-h-[40px] p-2 sm:px-3 sm:py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              title="Share document (Web Share)"
              aria-label="Share document"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">Share</span>
            </button>
          )}

          {blob && (
            <button
              type="button"
              onClick={handleDownload}
              className="min-w-[40px] min-h-[40px] p-2 sm:px-3 sm:py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              title="Download local copy"
              aria-label="Download local copy"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] w-9 h-9 sm:w-8 sm:h-8 rounded-xl bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-300 flex items-center justify-center cursor-pointer transition-colors"
            title="Close Preview (Esc)"
            aria-label="Close Preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Preview Canvas / Container */}
      <main className="flex-1 min-h-0 w-full flex items-center justify-center relative p-2 my-2 overflow-auto">
        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex flex-col items-center gap-3 text-center">
            <RefreshCw className="w-8 h-8 text-orange-400 animate-spin" />
            <p className="text-sm font-medium text-neutral-300">
              Loading document from Google Drive...
            </p>
            <p className="text-xs text-neutral-500">
              {doc.name}
            </p>
          </div>
        )}

        {/* Error / Unsupported Message */}
        {!isLoading && errorMessage && (
          <div className="max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-6 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-neutral-100">
                {needsReconnect ? 'Reconnect Required' : 'Unable to Preview Document'}
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                {errorMessage}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 pt-2">
              {needsReconnect ? (
                <button
                  type="button"
                  onClick={reconnect}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs cursor-pointer shadow-md shadow-orange-500/20"
                >
                  Reconnect Google
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!blob}
                  className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-200 font-semibold text-xs cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>
              )}

              <a
                href={`https://drive.google.com/file/d/${doc.id}/view`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 font-semibold text-xs inline-flex items-center gap-1.5"
              >
                <span>Google Drive</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* PDF Viewer (Canvas + Object Embed) */}
        {!isLoading && !errorMessage && isPdf && blobUrl && (
          <div className="w-full h-full flex flex-col items-center justify-center overflow-auto">
            {/* Preferred crisp canvas render */}
            <div
              className="bg-white rounded-xl shadow-2xl p-1 transition-transform origin-center"
              style={{ transform: `scale(${zoomLevel})` }}
            >
              <canvas ref={canvasRef} className="rounded-lg shadow-sm" />
            </div>

            {/* Fallback hidden object element for native capabilities */}
            <object
              data={blobUrl}
              type="application/pdf"
              className="hidden"
              aria-label={doc.name}
            >
              <p>PDF loaded</p>
            </object>
          </div>
        )}

        {/* Image Viewer */}
        {!isLoading && !errorMessage && isImage && blobUrl && (
          <div className="w-full h-full flex items-center justify-center overflow-auto p-4">
            <img
              src={blobUrl}
              alt={doc.cleanTitle || doc.name}
              className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl transition-transform"
              style={{ transform: `scale(${zoomLevel})` }}
            />
          </div>
        )}
      </main>

      {/* Bottom Controls Bar (Pagination, Zoom) */}
      {!isLoading && !errorMessage && (isPdf || isImage) && (
        <footer className="flex items-center justify-between gap-2 sm:gap-3 bg-neutral-900/90 border border-white/10 rounded-2xl px-3 sm:px-4 py-2 shrink-0 z-10 shadow-lg">
          {/* Pagination Controls for PDF */}
          {isPdf && pdfPageCount > 1 ? (
            <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-neutral-300">
              <button
                type="button"
                onClick={() => setPdfCurrentPage((p) => Math.max(1, p - 1))}
                disabled={pdfCurrentPage <= 1}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
                title="Previous page"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="font-semibold px-1 text-xs">
                {pdfCurrentPage} / {pdfPageCount}
              </span>

              <button
                type="button"
                onClick={() => setPdfCurrentPage((p) => Math.min(pdfPageCount, p + 1))}
                disabled={pdfCurrentPage >= pdfPageCount}
                className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
                title="Next page"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="text-[11px] sm:text-xs text-neutral-400 font-medium">
              {isPdf ? `${pdfPageCount} page${pdfPageCount === 1 ? '' : 's'}` : '100% Client-Side Preview'}
            </div>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-0.5 sm:gap-1 text-xs">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.2))}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-neutral-800 text-neutral-300 cursor-pointer"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span className="w-10 sm:w-12 text-center font-semibold text-neutral-300 text-xs">
              {Math.round(zoomLevel * 100)}%
            </span>

            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(2.5, z + 0.2))}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-neutral-800 text-neutral-300 cursor-pointer"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setZoomLevel(1)}
              className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-neutral-800 text-neutral-400 cursor-pointer"
              title="Reset zoom"
              aria-label="Reset zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
};
